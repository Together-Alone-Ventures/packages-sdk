/** Accepts Uint8Array, number[], or JSON object form `{"0":1,"1":2}` from Express. */
export function coerceBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (Array.isArray(v)) return new Uint8Array(v);
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
      return new Uint8Array(obj.data as number[]);
    }
    const pairs = Object.entries(obj)
      .filter(([k]) => /^\d+$/.test(k))
      .map(([k, n]) => [Number(k), Number(n)] as const)
      .sort((a, b) => a[0] - b[0]);
    if (pairs.length > 0) {
      return new Uint8Array(pairs.map(([, n]) => n));
    }
  }
  return new Uint8Array();
}

export function bytesToHex(bytes: unknown): string {
  const arr = coerceBytes(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexPreview(bytes: unknown, max = 12): string {
  const hex = bytesToHex(bytes);
  if (!hex) return '—';
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

export function asBytes(v: unknown): Uint8Array {
  return coerceBytes(v);
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
  const ev = receipt?.core_transition_evidence;
  if (!ev) {
    return { subjectHex: '—', preHex: '—', postHex: '—', proofLen: 0 };
  }
  return {
    subjectHex: hexPreview(ev.subject_reference, 16),
    preHex: hexPreview(ev.pre_state_commitment, 16),
    postHex: hexPreview(ev.post_state_commitment, 16),
    proofLen: asBytes(ev.tree_proof).length,
  };
}

/** JSON-safe receipt (number[] blobs) for API responses and localStorage. */
export function serializeReceiptForJson(
  receipt: import('./types.js').Receipt
): import('./types.js').Receipt {
  const ev = receipt.core_transition_evidence;
  const tomb = ev.deletion_state_material?.tombstoned_position;
  return {
    protocol_version: receipt.protocol_version,
    receipt_version: receipt.receipt_version,
    core_transition_evidence: {
      subject_reference: [...coerceBytes(ev.subject_reference)],
      pre_state_commitment: [...coerceBytes(ev.pre_state_commitment)],
      post_state_commitment: [...coerceBytes(ev.post_state_commitment)],
      transition_material: [...coerceBytes(ev.transition_material)],
      tree_proof: [...coerceBytes(ev.tree_proof)],
      deletion_state_material: tomb
        ? { tombstoned_position: [...coerceBytes(tomb)] }
        : {},
    },
  };
}
