/**
 * Public OffSign server API — four integrator entry points:
 * - offsign() after DELETE
 * - issueAttestedDeletionReceipt() on-chain CVDR after offsign
 * - attestDeletionProof() from CVDR receipt + DB re-read
 * - issueDeletionCertificate() PDF after DB re-read
 */
export { offsign, type OffsignInput } from './offsign.js';
export {
  issueAttestedDeletionReceipt,
  queryMktd03Receipt,
  queryMktd03Status,
  type Mktd03IssuanceActor,
} from './issueAttestedDeletionReceipt.js';
export { attestDeletionProof, type AttestDeletionProofParams } from './attestDeletionProof.js';
export {
  issueDeletionCertificate,
  type IssueDeletionCertificateParams,
  type IssueDeletionCertificateResult,
} from './issueDeletionCertificate.js';
export {
  guardRestoreAgainstMktd03,
  type GuardRestoreAgainstMktd03Params,
  type RestoreGuardClient,
} from './restoreGuard.js';

export type {
  DeletionDatabaseCheckResult,
  Receipt,
  SignedBackendDeletionAttestationV1,
  OffsignDatabaseVerification,
  WiredDeletionDatabaseType,
  WiredDeletionProps,
  RestoreGuardResult,
  RestoreGuardPolicy,
} from '@together-alone/zombiedelete-core';

export type {
  DeletionAuditMetadata,
  IssueAttestedDeletionReceiptParams,
  IssuanceProgress,
  ReceiptLookup,
} from './issuanceTypes.js';

export { OffsignDeletionNotVerifiedError } from '@together-alone/zombiedelete-core';
