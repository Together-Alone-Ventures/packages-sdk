import { Actor, type HttpAgent } from '@dfinity/agent';
import type { Ed25519KeyIdentity } from '@dfinity/identity';
import { Principal } from '@dfinity/principal';
import {
  auditExtensionsFromSignedAttestation,
  asBytes,
  auditErrorLabel,
  issuanceErrorLabel,
  TOMBSTONE_DELETION_STATE,
  transitionMaterialFromAttestation,
  validateMktd03DeletionAuditInput,
  variantKey,
  verifySignedBackendAttestation,
  type Receipt,
} from '@together-alone/zombiedelete-core';
import { createIcAgent } from './icAgent.js';
import type {
  DeletionAuditMetadata,
  IssueAttestedDeletionReceiptParams,
  IssuanceProgress,
  ReceiptLookup,
} from './issuanceTypes.js';
import { mktd03IdlFactory } from './mktd03Idl.js';
import { assertCommercialPreflight } from './preflightCommercial.js';

export type Mktd03IssuanceActor = {
  get_tree_mode_status: () => Promise<{
    build_identity: { build_label?: [string] };
    lifecycle_state: Record<string, unknown>;
  }>;
  get_receipt: (subject: Uint8Array | number[]) => Promise<Record<string, unknown>>;
  begin_tree_receipt_issuance: (req: {
    subject_reference: Uint8Array | number[];
    scope_reference: [] | [Uint8Array | number[]];
    transition_material: Uint8Array | number[];
    deletion_state_material: Uint8Array | number[];
  }) => Promise<Record<string, unknown>>;
  get_pending_certificate_material: (
    pendingId: Uint8Array | number[]
  ) => Promise<Record<string, unknown>>;
  finalize_tree_receipt: (req: {
    pending_id: Uint8Array | number[];
    certificate_material: Uint8Array | number[];
  }) => Promise<Record<string, unknown>>;
  set_audit_metadata: (
    subjectReference: Uint8Array | number[],
    metadata: {
      subject_label: [] | [string];
      data_category: [] | [string];
      source_system: [] | [string];
      source_locator: [] | [string];
      legal_context: [] | [string];
      locale: [] | [string];
      gate_mode: [];
      oem_identifier: [] | [string];
      extensions: [] | [Array<[string, string]>];
    }
  ) => Promise<Record<string, unknown>>;
  get_allowance_status: () => Promise<Record<string, unknown>>;
  get_security_status: () => Promise<Record<string, unknown>>;
};

function createMktd03Actor(agent: HttpAgent, canisterId: string): Mktd03IssuanceActor {
  return Actor.createActor(mktd03IdlFactory, {
    agent,
    canisterId: Principal.fromText(canisterId.trim()),
  }) as Mktd03IssuanceActor;
}

function optText(value?: string): [] | [string] {
  const trimmed = value?.trim();
  return trimmed ? [trimmed] : [];
}

function auditExtensions(audit?: DeletionAuditMetadata): [] | [Array<[string, string]>] {
  if (!audit?.extensions?.length) return [];
  return [audit.extensions];
}

function parseReceiptLookup(result: Record<string, unknown>): ReceiptLookup {
  if ('ok' in result) {
    return { kind: 'ok', receipt: result.ok as Receipt };
  }
  const errKey = variantKey(result.err as Record<string, unknown>);
  if (errKey === 'not_found') return { kind: 'not_found' };
  if (errKey === 'not_yet_issued') return { kind: 'not_yet_issued' };
  if (errKey === 'invalid_subject_reference') return { kind: 'invalid_subject' };
  return { kind: 'not_found' };
}

function subjectReferenceFromHex(subjectReferenceHex: string): Uint8Array {
  const hex = subjectReferenceHex.trim().toLowerCase();
  const subjectReference = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    subjectReference[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return subjectReference;
}

async function resolveCertificateMaterial(
  actor: Mktd03IssuanceActor,
  pendingId: Uint8Array
): Promise<Uint8Array> {
  const certResult = await actor.get_pending_certificate_material(pendingId);

  if ('ok' in certResult) {
    const material = (certResult as { ok: { certificate_material: number[] } }).ok
      .certificate_material;
    const bytes = asBytes(material);
    if (bytes.length > 0) {
      return bytes;
    }
  }

  const errKey =
    'err' in certResult
      ? variantKey(certResult.err as Record<string, unknown>)
      : 'certificate_unavailable';
  throw new Error(
    [
      `Phase B failed (${issuanceErrorLabel({ [errKey]: null } as Record<string, unknown>)}).`,
      'Subnet certificate from get_pending_certificate_material is required before finalize.',
      'Ensure dfx/PocketIC is running and retry from step 1.',
    ].join(' ')
  );
}

async function setDeletionAuditMetadata(
  actor: Mktd03IssuanceActor,
  subjectReference: Uint8Array,
  audit?: DeletionAuditMetadata
): Promise<void> {
  if (!audit) return;
  const result = await actor.set_audit_metadata(subjectReference, {
    subject_label: optText(audit.subjectLabel),
    data_category: optText(audit.dataCategory),
    source_system: optText(audit.sourceSystem),
    source_locator: optText(audit.sourceLocator),
    legal_context: optText(audit.legalContext),
    locale: [],
    gate_mode: [],
    oem_identifier: [],
    extensions: auditExtensions(audit),
  });
  if ('Err' in result) {
    throw new Error(auditErrorLabel(result.Err as Record<string, unknown>));
  }
}

export async function createMktd03IssuanceClient(opts: {
  canisterId: string;
  icHost: string;
  controllerIdentity: Ed25519KeyIdentity;
}): Promise<{ actor: Mktd03IssuanceActor; principalText: string }> {
  const agent = await createIcAgent(opts.icHost, opts.controllerIdentity);
  return {
    actor: createMktd03Actor(agent, opts.canisterId),
    principalText: opts.controllerIdentity.getPrincipal().toText(),
  };
}

export async function queryMktd03Receipt(
  canisterId: string,
  icHost: string,
  subjectReference: Uint8Array
): Promise<ReceiptLookup> {
  const agent = await createIcAgent(icHost);
  const actor = createMktd03Actor(agent, canisterId);
  const result = await actor.get_receipt(subjectReference);
  return parseReceiptLookup(result as Record<string, unknown>);
}

export async function queryMktd03Status(
  canisterId: string,
  icHost: string
): Promise<string> {
  const agent = await createIcAgent(icHost);
  const actor = createMktd03Actor(agent, canisterId);
  const status = await actor.get_tree_mode_status();
  const label = status.build_identity.build_label?.[0];
  const lifecycle = variantKey(status.lifecycle_state as Record<string, unknown>);
  return [label, lifecycle].filter(Boolean).join(' · ');
}

async function issueDeletionReceiptOnCanister(
  actor: Mktd03IssuanceActor,
  params: {
    subjectReference: Uint8Array;
    transitionMaterial: Uint8Array;
    scopeReference?: Uint8Array | null;
    audit?: DeletionAuditMetadata;
    onProgress?: (progress: IssuanceProgress) => void;
  }
): Promise<Receipt> {
  const scope = params.scopeReference
    ? ([params.scopeReference] as [Uint8Array])
    : ([] as []);

  if (params.audit) {
    validateMktd03DeletionAuditInput(params.audit);
  }

  params.onProgress?.({ step: 'begin', message: 'Starting tree receipt issuance on-chain…' });
  const beginResult = await actor.begin_tree_receipt_issuance({
    subject_reference: params.subjectReference,
    scope_reference: scope,
    transition_material: params.transitionMaterial,
    deletion_state_material: TOMBSTONE_DELETION_STATE,
  });

  if ('err' in beginResult) {
    throw new Error(issuanceErrorLabel(beginResult.err as Record<string, unknown>));
  }

  const pending = (beginResult as { ok: { pending_id: number[] } }).ok;
  const pendingId = asBytes(pending.pending_id);

  params.onProgress?.({
    step: 'metadata',
    message: 'Attaching audit metadata for the PDF certificate…',
  });
  await setDeletionAuditMetadata(actor, params.subjectReference, params.audit);

  params.onProgress?.({
    step: 'certificate',
    message: 'Binding subnet certificate to pending commitment…',
  });
  const certificateMaterial = await resolveCertificateMaterial(actor, pendingId);

  params.onProgress?.({
    step: 'finalize',
    message: 'Finalizing CVDR and committing tombstone to the tree…',
  });
  const finalizeResult = await actor.finalize_tree_receipt({
    pending_id: pendingId,
    certificate_material: certificateMaterial,
  });

  if ('err' in finalizeResult) {
    throw new Error(issuanceErrorLabel(finalizeResult.err as Record<string, unknown>));
  }

  const receipt = (finalizeResult as { ok: Receipt }).ok;
  params.onProgress?.({ step: 'done', message: 'Deletion receipt issued.' });
  return receipt;
}

/**
 * Verify a backend offsign attestation, bind transition_material, then issue the CVDR receipt
 * on MKTd03 (begin → metadata → certificate → finalize). Signed by `controllerIdentity`.
 */
export async function issueAttestedDeletionReceipt(
  params: IssueAttestedDeletionReceiptParams
): Promise<Receipt> {
  const canisterId = params.canisterId.trim();
  if (!canisterId) {
    throw new Error('canisterId is required');
  }

  const { actor } = await createMktd03IssuanceClient({
    canisterId,
    icHost: params.icHost,
    controllerIdentity: params.controllerIdentity,
  });

  if (!params.skipPreflight) {
    params.onProgress?.({
      step: 'begin',
      message: 'Checking commercial allowance and security surface…',
    });
    await assertCommercialPreflight(actor);
  }

  const attestation = await verifySignedBackendAttestation(params.signedAttestation, {
    trustedPublicKeyHex: params.trustedBackendPublicKeyHex,
    maxAgeMs: params.maxAttestationAgeMs,
  });

  const subjectReference = subjectReferenceFromHex(attestation.subjectReferenceHex);
  const transitionMaterial = await transitionMaterialFromAttestation(attestation);
  const attestationExtensions = auditExtensionsFromSignedAttestation(params.signedAttestation);

  return issueDeletionReceiptOnCanister(actor, {
    subjectReference,
    transitionMaterial,
    audit: {
      ...params.audit,
      sourceSystem: params.audit?.sourceSystem ?? attestation.sourceSystem,
      sourceLocator: params.audit?.sourceLocator ?? attestation.sourceLocator,
      extensions: attestationExtensions,
    },
    onProgress: params.onProgress,
  });
}
