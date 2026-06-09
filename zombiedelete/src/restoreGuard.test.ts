import { describe, expect, it } from 'vitest';
import { guardRestoreAgainstMktd03 } from './restoreGuard.js';
import type { ReceiptLookup } from './types.js';

describe('guardRestoreAgainstMktd03', () => {
  const subject = new Uint8Array(32).fill(0x42);

  it('blocks when receipt exists on chain', async () => {
    const guard = await guardRestoreAgainstMktd03({
      subjectReference: subject,
      client: {
        async getReceipt(): Promise<ReceiptLookup> {
          return {
            kind: 'ok',
            receipt: {
              protocol_version: { major: 1, minor: 0, patch: 0 },
              receipt_version: { major: 2, minor: 0, patch: 0 },
              core_transition_evidence: {
                subject_reference: subject,
                pre_state_commitment: [],
                post_state_commitment: [],
                transition_material: [],
                tree_proof: [],
                deletion_state_material: { tombstoned_position: [1] },
              },
            },
          };
        },
      },
    });
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) {
      expect(guard.reason).toBe('tombstoned_on_chain');
    }
  });

  it('allows when receipt not found', async () => {
    const guard = await guardRestoreAgainstMktd03({
      subjectReference: subject,
      client: {
        async getReceipt(): Promise<ReceiptLookup> {
          return { kind: 'not_found' };
        },
      },
    });
    expect(guard.allowed).toBe(true);
  });

  it('blocks on local registry hit', async () => {
    const guard = await guardRestoreAgainstMktd03({
      subjectReference: subject,
      client: {
        async getReceipt(): Promise<ReceiptLookup> {
          return { kind: 'not_found' };
        },
      },
      localRegistry: async () => true,
    });
    expect(guard.allowed).toBe(false);
    if (!guard.allowed) {
      expect(guard.reason).toBe('local_deletion_registry');
    }
  });
});
