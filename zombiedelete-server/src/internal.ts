/** Advanced / test helpers — not part of the integrator public API. */
export {
  buildGoneproofDeletePayload,
  offsign,
  type BuildGoneproofDeletePayloadInput,
  type GoneproofDeletePayload,
  type OffsignInput,
} from './offsign.js';
export { checkDeclaredDeletionInDatabase } from './checkDeclaredDeletionInDatabase.js';
export { renderAuditPdfOnCanister } from './renderAuditPdfOnCanister.js';
export {
  createMktd03IssuanceClient,
  queryMktd03Receipt,
  queryMktd03Status,
} from './issueAttestedDeletionReceipt.js';
export { mktd03IdlFactory } from './mktd03Idl.js';
export { preflightCommercial, assertCommercialPreflight } from './preflightCommercial.js';
export {
  queryAllowanceStatus,
  querySecurityStatus,
  mergeCommercialPreflight,
  type AllowanceStatusView,
  type CommercialActor,
  type SecurityStatusView,
} from './commercial.js';
export {
  guardRestoreAgainstMktd03,
  type GuardRestoreAgainstMktd03Params,
  type RestoreGuardClient,
} from './restoreGuard.js';
export { createIcAgent, formatControllerRejectError, normalizeIcHost } from './icAgent.js';
export {
  assertDatabaseVerifier,
  createDatabaseVerifier,
  createMongoVerifier,
  createMysqlVerifier,
  createPostgresVerifier,
  createTestDatabaseVerifier,
  createWiredDeletionVerifier,
  buildSqlAbsentCheckQuery,
  hasWiredDeletionProps,
  resolveDatabaseVerifier,
  runDatabaseAbsentCheck,
  verifyDeletionContextFromOffsignInput,
  OffsignInvalidDatabaseIdentifierError,
  type CreateWiredDeletionVerifierParams,
  type MongoFindable,
  type MysqlQueryable,
  type PostgresQueryable,
} from './databaseVerifier.js';

export {
  buildBackendDeletionAttestation,
  signBackendDeletionAttestation,
  validateBackendDeletionAttestation,
  canonicalJson,
  attestationSigningMessage,
  attestationCanonicalBytes,
  ATTESTATION_EXTENSION_KEYS,
  BACKEND_ATTESTATION_SIGN_DOMAIN,
  sha256,
  deriveTransitionMaterial,
  TRANSITION_DERIVATION_VERSION,
  OffsignDatabaseVerifierRequiredError,
  OffsignDeletionNotVerifiedError,
} from '@together-alone/zombiedelete-core';

export type {
  BackendDeletionAttestationV1,
  SignedBackendDeletionAttestationV1,
  DatabaseEngine,
  DatabaseVerifier,
  OffsignDatabaseVerification,
  SqlAbsentRecordData,
  WiredDeletionData,
  WiredDeletionDatabaseType,
  WiredDeletionProps,
  VerifyDeletion,
  VerifyDeletionResult,
  VerifyDeletionContext,
  DeletionDatabaseCheckResult,
  CheckDeclaredDeletionParams,
  Receipt,
} from '@together-alone/zombiedelete-core';
