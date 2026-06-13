import type {
  CheckDeclaredDeletionParams,
  DeletionDatabaseCheckResult,
  Receipt,
} from '@together-alone/zombiedelete-core';
import { checkDeclaredDeletionInDatabase } from './checkDeclaredDeletionInDatabase.js';

export type AttestDeletionProofParams = CheckDeclaredDeletionParams & {
  /** CVDR receipt from MKTd03 (proof of on-chain deletion processing). */
  receipt: Receipt;
};

/**
 * From a CVDR receipt + signed offsign payload: verify attestation crypto,
 * confirm receipt binding, then re-read the database (read-only absence check).
 */
export async function attestDeletionProof(
  params: AttestDeletionProofParams
): Promise<DeletionDatabaseCheckResult> {
  if (!params.receipt) {
    throw new Error('receipt is required');
  }
  return checkDeclaredDeletionInDatabase(params);
}
