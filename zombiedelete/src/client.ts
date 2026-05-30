import { Actor, HttpAgent, type ActorSubclass } from '@dfinity/agent';
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
} from '@together-alone/zombiedelete-core';
import { buildAuditorToken, downloadPdfBytes } from './audit.js';
import { mktd03IdlFactory } from './idl.js';
import {
  createSigningSession,
  formatControllerRejectError,
  type SigningOptions,
  type SigningSession,
} from './signing.js';
import type {
  DeletionAuditMetadata,
  IssueAttestedDeletionReceiptParams,
  IssueDeletionReceiptParams,
  Receipt,
  ReceiptLookup,
} from './types.js';

export type Mktd03Actor = ActorSubclass<{
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
  render_audit_pdf: (
    subjectReference: Uint8Array | number[],
    token: Uint8Array | number[]
  ) => Promise<Record<string, unknown>>;
}>;

export type ZombieDeleteConnectOptions = {
  canisterId: string;
  agent?: HttpAgent;
  icHost?: string;
  useDevProxy?: boolean;
  signing?: SigningOptions;
  auditorHmacKeyHex?: string;
};

function createActor(agent: HttpAgent, canisterId: string): Mktd03Actor {
  return Actor.createActor(mktd03IdlFactory, {
    agent,
    canisterId: Principal.fromText(canisterId),
  }) as Mktd03Actor;
}

function optText(value?: string): [] | [string] {
  const trimmed = value?.trim();
  return trimmed ? [trimmed] : [];
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

async function resolveCertificateMaterial(
  actor: Mktd03Actor,
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

function auditExtensions(audit?: DeletionAuditMetadata): [] | [Array<[string, string]>] {
  if (!audit?.extensions?.length) return [];
  return [audit.extensions];
}

async function setDeletionAuditMetadata(
  actor: Mktd03Actor,
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

export class ZombieDeleteClient {
  readonly canisterId: string;
  readonly agent: HttpAgent;
  readonly signing: SigningSession | null;
  readonly auditorHmacKeyHex: string | undefined;

  private readonly actor: Mktd03Actor;

  private constructor(
    canisterId: string,
    agent: HttpAgent,
    signing: SigningSession | null,
    auditorHmacKeyHex: string | undefined
  ) {
    this.canisterId = canisterId;
    this.agent = agent;
    this.signing = signing;
    this.auditorHmacKeyHex = auditorHmacKeyHex;
    this.actor = createActor(agent, canisterId);
  }

  static async connect(options: ZombieDeleteConnectOptions): Promise<ZombieDeleteClient> {
    const canisterId = options.canisterId.trim();
    if (!canisterId) {
      throw new Error('canisterId is required');
    }

    if (options.agent) {
      return new ZombieDeleteClient(canisterId, options.agent, null, options.auditorHmacKeyHex);
    }

    const icHost = options.icHost?.trim() || 'http://127.0.0.1:4943';
    const signing = createSigningSession({
      ...options.signing,
      icHost: options.signing?.icHost ?? icHost,
      useDevProxy: options.useDevProxy ?? options.signing?.useDevProxy,
    });
    const agent = await signing.createAgent();
    return new ZombieDeleteClient(canisterId, agent, signing, options.auditorHmacKeyHex);
  }

  get signerPrincipal(): string {
    return this.signing?.principalText ?? '—';
  }

  get signingModeLabel(): string {
    return this.signing?.modeLabel ?? 'custom agent';
  }

  disconnect(): void {
    this.signing?.clear();
  }

  async getStatus(): Promise<string> {
    const status = await this.actor.get_tree_mode_status();
    const label = status.build_identity.build_label?.[0];
    const lifecycle = variantKey(status.lifecycle_state as Record<string, unknown>);
    return [label, lifecycle].filter(Boolean).join(' · ');
  }

  async getReceipt(subjectReference: Uint8Array): Promise<ReceiptLookup> {
    const result = await this.actor.get_receipt(subjectReference);
    return parseReceiptLookup(result as Record<string, unknown>);
  }

  async issueDeletionReceipt(params: IssueDeletionReceiptParams): Promise<Receipt> {
    const scope = params.scopeReference
      ? ([params.scopeReference] as [Uint8Array])
      : ([] as []);

    if (params.audit) {
      validateMktd03DeletionAuditInput(params.audit);
    }

    params.onProgress?.({ step: 'begin', message: 'Starting tree receipt issuance on-chain…' });
    const beginResult = await this.actor.begin_tree_receipt_issuance({
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
    await setDeletionAuditMetadata(this.actor, params.subjectReference, params.audit);

    params.onProgress?.({
      step: 'certificate',
      message: 'Binding subnet certificate to pending commitment…',
    });
    const certificateMaterial = await resolveCertificateMaterial(this.actor, pendingId);

    params.onProgress?.({
      step: 'finalize',
      message: 'Finalizing CVDR and committing tombstone to the tree…',
    });
    const finalizeResult = await this.actor.finalize_tree_receipt({
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
   * Verify a backend attestation (client API signed after DB delete), bind it to
   * `transition_material`, store it in audit extensions, then issue the CVDR receipt.
   */
  async issueAttestedDeletionReceipt(
    params: IssueAttestedDeletionReceiptParams
  ): Promise<Receipt> {
    const attestation = await verifySignedBackendAttestation(params.signedAttestation, {
      trustedPublicKeyHex: params.trustedBackendPublicKeyHex,
      maxAgeMs: params.maxAttestationAgeMs,
    });

    const subjectReferenceHex = attestation.subjectReferenceHex.trim().toLowerCase();
    const subjectReference = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      subjectReference[i] = parseInt(subjectReferenceHex.slice(i * 2, i * 2 + 2), 16);
    }

    const transitionMaterial = await transitionMaterialFromAttestation(attestation);
    const attestationExtensions = auditExtensionsFromSignedAttestation(params.signedAttestation);

    return this.issueDeletionReceipt({
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

  async tryReissue(params: {
    subjectReference: Uint8Array;
    transitionMaterial: Uint8Array;
    scopeReference?: Uint8Array | null;
  }): Promise<string> {
    const scope = params.scopeReference
      ? ([params.scopeReference] as [Uint8Array])
      : ([] as []);

    const beginResult = await this.actor.begin_tree_receipt_issuance({
      subject_reference: params.subjectReference,
      scope_reference: scope,
      transition_material: params.transitionMaterial,
      deletion_state_material: TOMBSTONE_DELETION_STATE,
    });

    if ('err' in beginResult) {
      return issuanceErrorLabel(beginResult.err as Record<string, unknown>);
    }
    return 'Unexpected: a second issuance was accepted (should be blocked).';
  }

  async fetchAuditPdf(subjectReference: Uint8Array): Promise<Uint8Array> {
    if (!this.auditorHmacKeyHex) {
      throw new Error('auditorHmacKeyHex is required to render audit PDF.');
    }
    const token = await buildAuditorToken(
      this.auditorHmacKeyHex,
      this.canisterId,
      subjectReference
    );
    const result = await this.actor.render_audit_pdf(subjectReference, token);
    if ('Err' in result) {
      throw new Error(auditErrorLabel(result.Err as Record<string, unknown>));
    }
    const pdf = asBytes((result as { Ok: number[] }).Ok);
    if (pdf.length < 5 || String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') {
      throw new Error('Canister returned invalid PDF bytes.');
    }
    return pdf;
  }

  async downloadAuditPdf(subjectReference: Uint8Array, filename: string): Promise<void> {
    const pdf = await this.fetchAuditPdf(subjectReference);
    downloadPdfBytes(pdf, filename);
  }

  formatAgentError(error: unknown): string {
    return formatControllerRejectError(
      error,
      this.canisterId,
      this.signerPrincipal,
      this.signingModeLabel
    );
  }
}
