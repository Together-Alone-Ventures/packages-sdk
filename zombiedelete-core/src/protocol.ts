export function bytesToHex(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexPreview(bytes: Uint8Array | number[], max = 12): string {
  const hex = bytesToHex(bytes);
  if (hex.length <= max * 2) return hex;
  return `${hex.slice(0, max * 2)}…`;
}

export async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const input =
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(input));
  return new Uint8Array(digest);
}

/** Protocol tombstone marker for tree-mode issuance (MKTd03 v1). */
export const TOMBSTONE_DELETION_STATE = new Uint8Array([0x01]);

export function asBytes(v: Uint8Array | number[]): Uint8Array {
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

export function variantKey(v: Record<string, unknown>): string {
  return Object.keys(v)[0] ?? 'unknown';
}

export function issuanceErrorLabel(err: Record<string, unknown>): string {
  const key = variantKey(err);
  const labels: Record<string, string> = {
    invalid_subject_reference: 'Invalid subject reference',
    invalid_scope_reference: 'Invalid scope reference',
    invalid_transition_material: 'Invalid transition material (must be 32 bytes)',
    invalid_deletion_state_material: 'Invalid deletion state material',
    pending_issuance_in_progress: 'Another issuance is already in progress',
    no_pending_issuance: 'No pending issuance',
    pending_id_mismatch: 'Pending id mismatch',
    certificate_unavailable: 'IC certificate unavailable (use local replica or retry)',
    issuance_failed: 'Issuance failed. Record may already be tombstoned on-chain.',
    validation_failed:
      'Receipt validation failed (often invalid subnet certificate at finalize)',
    storage_unavailable: 'Canister storage unavailable',
  };
  return labels[key] ?? key;
}

export function auditErrorLabel(err: Record<string, unknown>): string {
  const key = variantKey(err);
  const labels: Record<string, string> = {
    invalid_subject_reference: 'Invalid subject reference',
    not_found: 'Audit record not found for this subject',
    not_yet_issued: 'Receipt not finalized yet',
    metadata_rejected: 'Audit metadata rejected',
    storage_unavailable: 'Canister storage unavailable',
    not_implemented: 'Audit PDF not available on this canister build',
    wrong_principal: 'Not authorized to read audit data',
    invalid_token: 'Invalid auditor token',
    verification_failed: 'Audit verification failed',
    commercial_gate_failed: 'Commercial verification gate failed',
  };
  return labels[key] ?? key;
}

export function receiptSummary(receipt: import('./types.js').Receipt): {
  subjectHex: string;
  preHex: string;
  postHex: string;
  proofLen: number;
} {
  const ev = receipt.core_transition_evidence;
  return {
    subjectHex: hexPreview(ev.subject_reference, 12),
    preHex: hexPreview(ev.pre_state_commitment, 12),
    postHex: hexPreview(ev.post_state_commitment, 12),
    proofLen: asBytes(ev.tree_proof).length,
  };
}
