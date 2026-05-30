export { ZombieDeleteClient, type Mktd03Actor, type ZombieDeleteConnectOptions } from './client.js';
export { buildAuditorToken, downloadPdfBytes } from './audit.js';
export { mktd03IdlFactory } from './idl.js';
export {
  createSigningSession,
  formatControllerRejectError,
  isLocalReplicaHost,
  resolveAgentHost,
  type SigningMode,
  type SigningOptions,
  type SigningSession,
} from './signing.js';

export {
  verifyAttestationChain,
  verifySignedBackendAttestation,
  transitionMaterialFromAttestation,
  auditExtensionsFromSignedAttestation,
  ATTESTATION_EXTENSION_KEYS,
  validateMktd03DeletionAuditInput,
  sha256,
  receiptSummary,
  hexPreview,
  asBytes,
  issuanceErrorLabel,
  auditErrorLabel,
  TOMBSTONE_DELETION_STATE,
} from '@together-alone/zombiedelete-core';

export type {
  BackendDeletionAttestationV1,
  DeletionAuditMetadata,
  IssueAttestedDeletionReceiptParams,
  IssueDeletionReceiptParams,
  IssuanceProgress,
  Receipt,
  ReceiptLookup,
  SignedBackendDeletionAttestationV1,
} from './types.js';
