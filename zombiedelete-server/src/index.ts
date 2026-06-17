/**
 * Public OffSign server API:
 * - offsignDelete() — DELETE, DB verify, sign, MKTd03 CVDR (single flow)
 * - offsign() — low-level verify + sign after your own DELETE
 * - attestDeletionProof() / issueDeletionCertificate() — audit paths
 */
export { offsign, type OffsignInput } from './offsign.js';
export {
  offsignDelete,
  OffsignDeleteNotExecutedError,
  type OffsignDeleteInput,
  type OffsignDeleteResult,
  type OffsignMktd03Input,
} from './offsignDelete.js';
export {
  guardedInsert,
  OffsignInsertBlockedError,
  type GuardedInsertInput,
  type GuardedInsertResult,
} from './guardedInsert.js';
export {
  issueAttestedDeletionReceipt,
  queryMktd03Allowance,
  queryMktd03InterfaceVersion,
  queryMktd03Receipt,
  queryMktd03Status,
  type Mktd03AllowanceView,
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
export {
  formatDeletionSourceLocator,
  buildDeletionHandle,
  deriveDeletionSubjectReference,
  deriveDeletionSubjectReferenceFromHandle,
  type DeriveDeletionSubjectReferenceParams,
  type DeletionSourceLocatorInput,
} from '@together-alone/zombiedelete-core';
export { OffsignDeletionNotVerifiedError } from '@together-alone/zombiedelete-core';

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
