import type { SignedBackendDeletionAttestationV1 } from '@together-alone/zombiedelete-core';

export type { Receipt } from '@together-alone/zombiedelete-core';

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
  extensions?: Array<[string, string]>;
};

export type IssueAttestedDeletionReceiptParams = {
  canisterId: string;
  icHost: string;
  /** MKTd03 controller identity — typically the same org key as offsign(). */
  controllerIdentity: import('@dfinity/identity').Ed25519KeyIdentity;
  signedAttestation: SignedBackendDeletionAttestationV1;
  trustedBackendPublicKeyHex?: string;
  maxAttestationAgeMs?: number;
  skipPreflight?: boolean;
  audit?: Omit<DeletionAuditMetadata, 'extensions'>;
  onProgress?: (progress: IssuanceProgress) => void;
};
