export { buildAuditorToken } from './auditorToken.js';
export {
  ATTESTATION_EXTENSION_KEYS,
  BACKEND_ATTESTATION_SIGN_DOMAIN,
  attestationCanonicalBytes,
  attestationSigningMessage,
  auditExtensionsFromSignedAttestation,
  buildBackendDeletionAttestation,
  canonicalJson,
  signBackendDeletionAttestation,
  transitionMaterialFromAttestation,
  validateBackendDeletionAttestation,
  validateMktd03AuditExtensions,
  validateMktd03DeletionAuditInput,
  verifyAttestationChain,
  verifySignedBackendAttestation,
} from './attestation.js';
export {
  asBytes,
  auditErrorLabel,
  bytesToHex,
  hexPreview,
  issuanceErrorLabel,
  receiptSummary,
  serializeReceiptForJson,
  sha256,
  TOMBSTONE_DELETION_STATE,
  variantKey,
} from './protocol.js';
export {
  deriveTransitionMaterial,
  encodeSemanticVersionBe,
  TRANSITION_DERIVATION_VERSION,
} from './transitionMaterial.js';
export type {
  BackendDeletionAttestationV1,
  Receipt,
  SemanticVersion,
  SignedBackendDeletionAttestationV1,
} from './types.js';
export type {
  CheckDeclaredDeletionParams,
  CommercialPreflightStatus,
  ContextualVerifyDeletion,
  DatabaseEngine,
  DatabaseVerifier,
  OffsignDatabaseVerification,
  SqlAbsentRecordData,
  WiredDeletionData,
  WiredDeletionDatabaseType,
  WiredDeletionProps,
  DeletionDatabaseCheckResult,
  OffSignCommercialErrorCode,
  RestoreGuardPolicy,
  RestoreGuardResult,
  SecurityPreflightResult,
  VerifyDeletion,
  VerifyDeletionContext,
  VerifyDeletionResult,
} from './offsignTypes.js';
export {
  OffSignCommercialError,
  OffsignDatabaseVerifierRequiredError,
  OffsignDeletionNotVerifiedError,
} from './offsignTypes.js';
