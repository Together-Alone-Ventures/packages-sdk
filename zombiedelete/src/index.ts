export { ZombieDeleteClient, type Mktd03Actor, type ZombieDeleteConnectOptions } from './client.js';
export { buildAuditorToken, downloadPdfBytes } from './audit.js';
export { mktd03IdlFactory } from './idl.js';
export { preflightCommercial, assertCommercialPreflight } from './preflightCommercial.js';
export { guardRestoreAgainstMktd03, type GuardRestoreAgainstMktd03Params } from './restoreGuard.js';
export {
  checkDeclaredDeletionInDatabase,
  createDatabaseVerifier,
  createMongoVerifier,
  createMysqlVerifier,
  createPostgresVerifier,
  createWiredDeletionVerifier,
  offsign,
  type DatabaseVerifier,
  type OffsignInput,
  type WiredDeletionProps,
} from '@together-alone/zombiedelete-server';
export type { AllowanceStatusView, SecurityStatusView } from './commercial.js';
export type { RestoreGuardPolicy } from '@together-alone/zombiedelete-core';
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
  OffSignCommercialError,
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
  RestoreGuardResult,
  SecurityPreflightResult,
  OffSignCommercialErrorCode,
} from './types.js';
