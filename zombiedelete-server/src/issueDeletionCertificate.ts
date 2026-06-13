import {
  asBytes,
  OffsignDeletionNotVerifiedError,
  type DeletionDatabaseCheckResult,
  type Receipt,
} from '@together-alone/zombiedelete-core';
import { attestDeletionProof, type AttestDeletionProofParams } from './attestDeletionProof.js';
import { renderAuditPdfOnCanister } from './renderAuditPdfOnCanister.js';

export type IssueDeletionCertificateParams = AttestDeletionProofParams & {
  canisterId: string;
  icHost: string;
  auditorHmacKeyHex: string;
};

export type IssueDeletionCertificateResult = {
  attestation: DeletionDatabaseCheckResult;
  pdf: Uint8Array;
};

function subjectReferenceFromReceipt(receipt: Receipt): Uint8Array {
  const raw = receipt.core_transition_evidence.subject_reference;
  const bytes = asBytes(raw);
  if (bytes.length !== 32) {
    throw new Error('receipt subject_reference must be 32 bytes');
  }
  return bytes;
}

/**
 * Consult a CVDR deletion proof, re-verify database absence, then fetch the audit PDF certificate.
 */
export async function issueDeletionCertificate(
  params: IssueDeletionCertificateParams
): Promise<IssueDeletionCertificateResult> {
  const attestation = await attestDeletionProof(params);
  if (!attestation.ok) {
    throw new OffsignDeletionNotVerifiedError(
      attestation.detail ?? 'deletion_proof_db_attestation_failed'
    );
  }

  const subjectReference = subjectReferenceFromReceipt(params.receipt);
  const pdf = await renderAuditPdfOnCanister({
    canisterId: params.canisterId,
    icHost: params.icHost,
    subjectReference,
    auditorHmacKeyHex: params.auditorHmacKeyHex,
  });

  return { attestation, pdf };
}
