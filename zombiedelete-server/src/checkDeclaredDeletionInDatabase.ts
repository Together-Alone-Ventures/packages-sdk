import {
  bytesToHex,
  OffsignDatabaseVerifierRequiredError,
  transitionMaterialFromAttestation,
  verifySignedBackendAttestation,
  type CheckDeclaredDeletionParams,
  type DeletionDatabaseCheckResult,
  type Receipt,
} from '@together-alone/zombiedelete-core';
import { resolveDatabaseVerifier, runDatabaseAbsentCheck } from './databaseVerifier.js';

function receiptBindingMatches(
  receipt: Receipt,
  subjectReferenceHex: string,
  transitionMaterial: Uint8Array
): boolean {
  const evidence = receipt.core_transition_evidence;
  const subjectBytes =
    evidence.subject_reference instanceof Uint8Array
      ? evidence.subject_reference
      : new Uint8Array(evidence.subject_reference);
  const subjectHex = bytesToHex(subjectBytes).toLowerCase();
  if (subjectHex !== subjectReferenceHex.toLowerCase()) {
    return false;
  }
  const transitionBytes =
    evidence.transition_material instanceof Uint8Array
      ? evidence.transition_material
      : new Uint8Array(evidence.transition_material);
  if (transitionBytes.length !== transitionMaterial.length) {
    return false;
  }
  for (let i = 0; i < transitionBytes.length; i += 1) {
    if (transitionBytes[i] !== transitionMaterial[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Reconcile a cryptographically anchored declaration (and optional canister receipt)
 * with a read-only DB check on the integrator's wired connection (C7).
 */
export async function checkDeclaredDeletionInDatabase(
  params: CheckDeclaredDeletionParams
): Promise<DeletionDatabaseCheckResult> {
  const checkedAtUnixMs = Date.now();
  const declaredSubjectReferenceHex =
    params.signedAttestation.attestation.subjectReferenceHex.trim().toLowerCase();

  try {
    const verified = await verifySignedBackendAttestation(params.signedAttestation, {
      trustedPublicKeyHex: params.trustedBackendPublicKeyHex,
    });

    let receiptBindingOk: boolean | undefined;
    if (params.receipt) {
      const transitionMaterial = await transitionMaterialFromAttestation(verified);
      receiptBindingOk = receiptBindingMatches(
        params.receipt,
        declaredSubjectReferenceHex,
        transitionMaterial
      );
      if (!receiptBindingOk) {
        return {
          ok: false,
          absent: false,
          attestationVerified: true,
          receiptBindingOk: false,
          declaredSubjectReferenceHex,
          detail: 'receipt_transition_material_mismatch',
          checkedAtUnixMs,
        };
      }
    }

    if (params.skipDatabaseVerification) {
      return {
        ok: true,
        absent: true,
        attestationVerified: true,
        receiptBindingOk,
        declaredSubjectReferenceHex,
        detail: 'database_verification_skipped',
        checkedAtUnixMs,
      };
    }

    const verifier = resolveDatabaseVerifier(params);
    const dbCheck = await runDatabaseAbsentCheck(verifier, {
      subjectReferenceHex: declaredSubjectReferenceHex,
      sourceLocator: verified.sourceLocator,
      deletionEventId: verified.deletionEventId,
    });

    const absent = Boolean(dbCheck.absent);
    return {
      ok: absent,
      absent,
      attestationVerified: true,
      receiptBindingOk,
      declaredSubjectReferenceHex,
      detail: dbCheck.detail,
      checkedAtUnixMs: dbCheck.checkedAtUnixMs ?? checkedAtUnixMs,
    };
  } catch (error) {
    if (error instanceof OffsignDatabaseVerifierRequiredError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      absent: false,
      attestationVerified: false,
      declaredSubjectReferenceHex,
      detail,
      checkedAtUnixMs,
    };
  }
}
