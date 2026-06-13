import { bytesToHex } from '@together-alone/zombiedelete-core';
import type { Receipt, RestoreGuardPolicy, RestoreGuardResult } from '@together-alone/zombiedelete-core';
import type { ReceiptLookup } from './issuanceTypes.js';

export type RestoreGuardClient = {
  getReceipt: (subjectReference: Uint8Array) => Promise<ReceiptLookup>;
};

export type GuardRestoreAgainstMktd03Params = {
  subjectReference: Uint8Array;
  client: RestoreGuardClient;
  localRegistry?: (subjectReferenceHex: string) => Promise<boolean>;
  policy?: RestoreGuardPolicy;
  /** @deprecated Prefer `policy.failClosedOnLookupError`. */
  failClosedOnLookupError?: boolean;
};

export async function guardRestoreAgainstMktd03(
  params: GuardRestoreAgainstMktd03Params
): Promise<RestoreGuardResult> {
  const subjectReferenceHex = bytesToHex(params.subjectReference).toLowerCase();

  if (params.localRegistry) {
    const registered = await params.localRegistry(subjectReferenceHex);
    if (registered) {
      return {
        allowed: false,
        reason: 'local_deletion_registry',
        subjectReferenceHex,
      };
    }
  }

  try {
    const lookup = await params.client.getReceipt(params.subjectReference);
    if (lookup.kind === 'ok') {
      return {
        allowed: false,
        reason: 'tombstoned_on_chain',
        receipt: lookup.receipt as Receipt,
        subjectReferenceHex,
      };
    }
    if (lookup.kind === 'not_yet_issued' || lookup.kind === 'invalid_subject') {
      return { allowed: true, receiptLookup: lookup.kind };
    }
    return { allowed: true, receiptLookup: 'not_found' };
  } catch {
    const failClosed =
      params.policy?.failClosedOnLookupError ?? params.failClosedOnLookupError ?? false;
    if (failClosed) {
      return {
        allowed: false,
        reason: 'tombstoned_on_chain',
        subjectReferenceHex,
      };
    }
    return { allowed: true, receiptLookup: 'not_found' };
  }
}
