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
import type { PendingIssuanceStore } from './pendingIssuanceStore.js';
import { mktd03IdlFactory } from './mktd03Idl.js';
import {
  mergeCommercialPreflight,
  queryAllowanceStatus,
  querySecurityStatus,
} from './commercial.js';
import { assertCommercialPreflight } from './preflightCommercial.js';

export type Mktd03IssuanceActor = {
  get_tree_mode_status: () => Promise<{
    interface_version: { major: number; minor: number; patch: number };
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

/** MKTd03 Candid interface version from get_tree_mode_status (e.g. 3.4.0). */
export async function queryMktd03InterfaceVersion(
  canisterId: string,
  icHost: string
): Promise<string> {
  const agent = await createIcAgent(icHost);
  const actor = createMktd03Actor(agent, canisterId);
  const status = await actor.get_tree_mode_status();
  const v = status.interface_version as { major: number; minor: number; patch: number };
  return `${v.major}.${v.minor}.${v.patch}`;
}

export type Mktd03AllowanceView = {
  remaining: string;
  reserved: string;
  available: string;
  commercialStatus: string;
  canEmit: boolean;
};

/** Query commercial deletion allowance on MKTd03 (remaining credits for CVDR issuance). */
export async function queryMktd03Allowance(
  canisterId: string,
  icHost: string
): Promise<Mktd03AllowanceView> {
  const agent = await createIcAgent(icHost);
  const actor = createMktd03Actor(agent, canisterId);
  const allowance = await queryAllowanceStatus(actor);
  let merged = {
    commercialStatus: allowance.commercialStatus,
    remaining: allowance.remaining,
    reserved: allowance.reserved,
    canEmit: allowance.devBypass,
    blockedReason: null as string | null,
  };
  try {
    const security = await querySecurityStatus(actor);
    const preflight = mergeCommercialPreflight(allowance, security);
    merged = {
      commercialStatus: preflight.commercialStatus,
      remaining: preflight.remaining,
      reserved: preflight.reserved,
      canEmit: preflight.canEmit,
      blockedReason: preflight.blockedReason,
    };
  } catch {
    // get_security_status optional on older canisters
  }
  const available = merged.remaining - merged.reserved;
  return {
    remaining: merged.remaining.toString(),
    reserved: merged.reserved.toString(),
    available: available.toString(),
    commercialStatus: merged.commercialStatus,
    canEmit: merged.canEmit,
  };
}

function subjectReferenceHex(subjectReference: Uint8Array): string {
  return Buffer.from(subjectReference).toString('hex');
}

function pendingIdFromHex(pendingIdHex: string): Uint8Array {
  const hex = pendingIdHex.trim().toLowerCase();
  if (hex.length !== 64 || !/^[0-9a-f]+$/.test(hex)) {
    throw new Error('invalid_pending_id_hex');
  }
  const pendingId = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    pendingId[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return pendingId;
}

function pendingIssuanceBlockedMessage(): string {
  return [
    'Another issuance is already in progress on this canister.',
    'A previous begin_tree_receipt_issuance was not finalized (network error, tab closed, or API restart).',
    'Only one pending issuance is allowed per canister until finalize completes.',
    'If you have a pending_id saved locally, call recover-pending; otherwise deploy a fresh MKTd03 canister.',
  ].join(' ');
}

async function finalizePendingIssuance(
  actor: Mktd03IssuanceActor,
  params: {
    canisterId: string;
    subjectReference: Uint8Array;
    pendingId: Uint8Array;
    audit?: DeletionAuditMetadata;
    onProgress?: (progress: IssuanceProgress) => void;
    pendingIssuanceStore?: PendingIssuanceStore;
  }
): Promise<Receipt> {
  params.onProgress?.({
    step: 'metadata',
    message: 'Resuming pending issuance — attaching audit metadata…',
  });
  await setDeletionAuditMetadata(actor, params.subjectReference, params.audit);

  params.onProgress?.({
    step: 'certificate',
    message: 'Resuming pending issuance — binding subnet certificate…',
  });
  const certificateMaterial = await resolveCertificateMaterial(actor, params.pendingId);

  params.onProgress?.({
    step: 'finalize',
    message: 'Resuming pending issuance — finalizing CVDR…',
  });
  const finalizeResult = await actor.finalize_tree_receipt({
    pending_id: params.pendingId,
    certificate_material: certificateMaterial,
  });

  if ('err' in finalizeResult) {
    throw new Error(issuanceErrorLabel(finalizeResult.err as Record<string, unknown>));
  }

  const receipt = (finalizeResult as { ok: Receipt }).ok;
  const subjectHex = subjectReferenceHex(params.subjectReference);
  if (params.pendingIssuanceStore) {
    await params.pendingIssuanceStore.clear(params.canisterId, subjectHex);
  }
  params.onProgress?.({ step: 'done', message: 'Deletion receipt issued.' });
  return receipt;
}

async function issueDeletionReceiptOnCanister(
  actor: Mktd03IssuanceActor,
  params: {
    canisterId: string;
    subjectReference: Uint8Array;
    transitionMaterial: Uint8Array;
    scopeReference?: Uint8Array | null;
    audit?: DeletionAuditMetadata;
    onProgress?: (progress: IssuanceProgress) => void;
    pendingIssuanceStore?: PendingIssuanceStore;
  }
): Promise<Receipt> {
  const scope = params.scopeReference
    ? ([params.scopeReference] as [Uint8Array])
    : ([] as []);

  if (params.audit) {
    validateMktd03DeletionAuditInput(params.audit);
  }

  const subjectHex = subjectReferenceHex(params.subjectReference);
  const existingLookup = parseReceiptLookup(
    (await actor.get_receipt(params.subjectReference)) as Record<string, unknown>
  );
  if (existingLookup.kind === 'ok') {
    if (params.pendingIssuanceStore) {
      await params.pendingIssuanceStore.clear(params.canisterId, subjectHex);
    }
    return existingLookup.receipt;
  }

  if (existingLookup.kind === 'not_yet_issued' && params.pendingIssuanceStore) {
    const saved = await params.pendingIssuanceStore.load(params.canisterId, subjectHex);
    if (saved?.pendingIdHex) {
      return finalizePendingIssuance(actor, {
        canisterId: params.canisterId,
        subjectReference: params.subjectReference,
        pendingId: pendingIdFromHex(saved.pendingIdHex),
        audit: params.audit,
        onProgress: params.onProgress,
        pendingIssuanceStore: params.pendingIssuanceStore,
      });
    }
    throw new Error(
      [
        'This subject has a pending on-chain issuance but no saved pending_id locally.',
        'Finalize cannot resume automatically. Deploy a fresh MKTd03 canister or contact support.',
      ].join(' ')
    );
  }

  params.onProgress?.({ step: 'begin', message: 'Starting tree receipt issuance on-chain…' });
  const beginResult = await actor.begin_tree_receipt_issuance({
    subject_reference: params.subjectReference,
    scope_reference: scope,
    transition_material: params.transitionMaterial,
    deletion_state_material: TOMBSTONE_DELETION_STATE,
  });

  if ('err' in beginResult) {
    const errKey = variantKey(beginResult.err as Record<string, unknown>);
    if (errKey === 'pending_issuance_in_progress') {
      throw new Error(pendingIssuanceBlockedMessage());
    }
    throw new Error(issuanceErrorLabel(beginResult.err as Record<string, unknown>));
  }

  const pending = (beginResult as { ok: { pending_id: number[] } }).ok;
  const pendingId = asBytes(pending.pending_id);

  if (params.pendingIssuanceStore) {
    await params.pendingIssuanceStore.save({
      canisterId: params.canisterId,
      subjectReferenceHex: subjectHex,
      pendingIdHex: Buffer.from(pendingId).toString('hex'),
      startedAt: new Date().toISOString(),
    });
  }

  try {
    return await finalizePendingIssuance(actor, {
      canisterId: params.canisterId,
      subjectReference: params.subjectReference,
      pendingId,
      audit: params.audit,
      onProgress: params.onProgress,
      pendingIssuanceStore: params.pendingIssuanceStore,
    });
  } catch (error) {
    if (params.pendingIssuanceStore) {
      // Keep pending_id on disk so a later retry can finalize without calling begin again.
    }
    throw error;
  }
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
    canisterId,
    subjectReference,
    transitionMaterial,
    audit: {
      ...params.audit,
      sourceSystem: params.audit?.sourceSystem ?? attestation.sourceSystem,
      sourceLocator: params.audit?.sourceLocator ?? attestation.sourceLocator,
      extensions: attestationExtensions,
    },
    onProgress: params.onProgress,
    pendingIssuanceStore: params.pendingIssuanceStore,
  });
}

/** Finalize a pending on-chain issuance when pending_id is known (e.g. from local store). */
export async function recoverMktd03PendingIssuance(params: {
  canisterId: string;
  icHost: string;
  controllerIdentity: import('@dfinity/identity').Ed25519KeyIdentity;
  subjectReference: Uint8Array;
  pendingIdHex: string;
  audit?: DeletionAuditMetadata;
  onProgress?: (progress: IssuanceProgress) => void;
  pendingIssuanceStore?: PendingIssuanceStore;
}): Promise<Receipt> {
  const canisterId = params.canisterId.trim();
  if (!canisterId) throw new Error('canisterId is required');

  const { actor } = await createMktd03IssuanceClient({
    canisterId,
    icHost: params.icHost,
    controllerIdentity: params.controllerIdentity,
  });

  return finalizePendingIssuance(actor, {
    canisterId,
    subjectReference: params.subjectReference,
    pendingId: pendingIdFromHex(params.pendingIdHex),
    audit: params.audit,
    onProgress: params.onProgress,
    pendingIssuanceStore: params.pendingIssuanceStore,
  });
}
