import { describe, expect, it } from 'vitest';
import {
  asBytes,
  auditErrorLabel,
  bytesToHex,
  hexPreview,
  issuanceErrorLabel,
  receiptSummary,
  sha256,
  TOMBSTONE_DELETION_STATE,
  variantKey,
} from './protocol.js';
import type { Receipt } from './types.js';

describe('protocol', () => {
  it('sha256 hashes UTF-8 strings deterministically', async () => {
    const a = await sha256('infoshare-demo:rec-1');
    const b = await sha256('infoshare-demo:rec-1');
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
    expect(bytesToHex(a)).not.toBe(bytesToHex(await sha256('infoshare-demo:rec-2')));
  });

  it('TOMBSTONE_DELETION_STATE is the v1 marker', () => {
    expect(Array.from(TOMBSTONE_DELETION_STATE)).toEqual([0x01]);
  });

  it('hexPreview truncates long hex', () => {
    const bytes = new Uint8Array(32).fill(0xab);
    expect(hexPreview(bytes, 4)).toBe('abababab…');
    expect(hexPreview(new Uint8Array([0x01]), 12)).toBe('01');
  });

  it('variantKey reads the candid variant tag', () => {
    expect(variantKey({ not_found: null })).toBe('not_found');
    expect(variantKey({})).toBe('unknown');
  });

  it('maps issuance and audit errors to stable labels', () => {
    expect(issuanceErrorLabel({ validation_failed: null })).toMatch(/validation failed/i);
    expect(auditErrorLabel({ invalid_token: null })).toMatch(/invalid auditor token/i);
    expect(issuanceErrorLabel({ exotic_code: null })).toBe('exotic_code');
  });

  it('receiptSummary exposes hex previews and proof length', () => {
    const receipt: Receipt = {
      protocol_version: { major: 1, minor: 0, patch: 0 },
      receipt_version: { major: 1, minor: 0, patch: 0 },
      core_transition_evidence: {
        subject_reference: new Uint8Array([1, 2, 3]),
        pre_state_commitment: new Uint8Array(32).fill(0xaa),
        post_state_commitment: new Uint8Array(32).fill(0xbb),
        transition_material: new Uint8Array(32),
        tree_proof: new Uint8Array([9, 9, 9]),
        deletion_state_material: { tombstoned_position: new Uint8Array([0x01]) },
      },
    };
    const sum = receiptSummary(receipt);
    expect(sum.subjectHex).toBe('010203');
    expect(sum.proofLen).toBe(3);
    expect(asBytes(receipt.core_transition_evidence.tree_proof).length).toBe(3);
  });

  it('receiptSummary decodes Express JSON object blobs', () => {
    const receipt = {
      protocol_version: { major: 1, minor: 0, patch: 0 },
      receipt_version: { major: 1, minor: 0, patch: 0 },
      core_transition_evidence: {
        subject_reference: { 0: 0xab, 1: 0xcd },
        pre_state_commitment: { 0: 0xaa },
        post_state_commitment: { 0: 0xbb },
        transition_material: [],
        tree_proof: { 0: 9, 1: 9, 2: 9 },
        deletion_state_material: {},
      },
    } as unknown as Receipt;
    const sum = receiptSummary(receipt);
    expect(sum.subjectHex).toBe('abcd');
    expect(sum.proofLen).toBe(3);
  });
});
