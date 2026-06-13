import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it } from 'vitest';
import { sha256 } from '@together-alone/zombiedelete-core';
import {
  checkDeclaredDeletionInDatabase,
  createTestDatabaseVerifier,
  offsign,
} from '@together-alone/zombiedelete-server/internal';
import { guardRestoreAgainstMktd03 } from './restoreGuard.js';
import { preflightCommercial } from './preflightCommercial.js';
import type { CommercialActor } from './commercial.js';
import type { ReceiptLookup } from './types.js';

describe('Lot B integration (offsign → check → guard → preflight)', () => {
  it('offsign → checkDeclaredDeletionInDatabase happy path', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('lotb:subject:1');
    const databaseVerifier = createTestDatabaseVerifier(async () => ({
      absent: true,
      checkedAtUnixMs: Date.now(),
    }));
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-lotb-1',
      databaseVerifier,
    });

    const check = await checkDeclaredDeletionInDatabase({
      signedAttestation: signed,
      trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
      databaseVerifier,
    });
    expect(check.ok).toBe(true);
    expect(check.attestationVerified).toBe(true);
  });

  it('offsign rejects when databaseVerifier reports row present', async () => {
    const identity = Ed25519KeyIdentity.generate();
    await expect(
      offsign({
        identity,
        subjectReference: await sha256('lotb:subject:2'),
        deletionEventId: 'evt-lotb-2',
        databaseVerifier: createTestDatabaseVerifier(async () => ({
          absent: false,
          detail: 'still_in_db',
        })),
      })
    ).rejects.toThrow(/still_in_db/);
  });

  it('guardRestoreAgainstMktd03 blocks tombstoned subjects', async () => {
    const subject = new Uint8Array(32).fill(0x11);
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
      policy: { failClosedOnLookupError: true },
    });
    expect(guard.allowed).toBe(false);
  });

  it('preflightCommercial blocks clone_suspected', async () => {
    const actor: CommercialActor = {
      get_allowance_status: async () => ({
        Ok: {
          commercial_status: { clone_suspected: null },
          remaining: 0n,
          reserved: 0n,
          allowance_seq: 1n,
          deployment_id: [],
          org_id: [],
          dev_bypass: false,
        },
      }),
      get_security_status: async () => ({
        Ok: {
          security_status: { clone_suspected: null },
          commercial_status: [{ exhausted: null }],
          deployment_id: [],
          org_id: [],
          module_hash: [],
          blocked_reason: ['clone_detected'],
          can_emit: false,
        },
      }),
    };
    const result = await preflightCommercial(actor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('clone_detected');
    }
  });
});
