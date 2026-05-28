import type { SignedBackendDeletionAttestationV1 } from '@together-alone/zombiedelete-core';

export type { Receipt, SemanticVersion } from '@together-alone/zombiedelete-core';

export type ReceiptLookup =
  | { kind: 'not_found' }
  | { kind: 'not_yet_issued' }
  | { kind: 'invalid_subject' }
  | { kind: 'ok'; receipt: import('@together-alone/zombiedelete-core').Receipt };

export type IssuanceProgress = {
  step: 'begin' | 'certificate' | 'finalize' | 'metadata' | 'done';
  message: string;
};

export type DeletionAuditMetadata = {
  subjectLabel?: string;
  dataCategory?: string;
  sourceSystem?: string;
  sourceLocator?: string;
  legalContext?: string;
  /** Candid `set_audit_metadata.extensions` — stored on-canister and surfaced in PDF. */
  extensions?: Array<[string, string]>;
};

export type IssueDeletionReceiptParams = {
  subjectReference: Uint8Array;
  transitionMaterial: Uint8Array;
  scopeReference?: Uint8Array | null;
  audit?: DeletionAuditMetadata;
  onProgress?: (progress: IssuanceProgress) => void;
};

/** Issue a receipt only after verifying a backend attestation (v1). */
export type IssueAttestedDeletionReceiptParams = {
  signedAttestation: SignedBackendDeletionAttestationV1;
  /** Pin the client's backend signing key (recommended in production). */
  trustedBackendPublicKeyHex?: string;
  /** Reject attestations older than this (default 24h). */
  maxAttestationAgeMs?: number;
  audit?: Omit<DeletionAuditMetadata, 'extensions'>;
  onProgress?: (progress: IssuanceProgress) => void;
};

export type {
  BackendDeletionAttestationV1,
  SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete-core';
