import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it, vi } from 'vitest';
import {
  OffsignDatabaseVerifierRequiredError,
  OffsignDeletionNotVerifiedError,
  sha256,
  verifySignedBackendAttestation,
} from '@together-alone/zombiedelete-core';
import { buildGoneproofDeletePayload, offsign } from './offsign.js';
import { createTestDatabaseVerifier } from './databaseVerifier.js';

describe('offsign', () => {
  it('signs with inline wired DB props (connection + databaseType + table + data)', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:7');
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const payload = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-1',
      connection: { query },
      databaseType: 'postgres',
      tableOrCollection: 'contacts',
      data: { keyField: 'id', keyValue: '7' },
    });
    await expect(
      verifySignedBackendAttestation(payload, {
        trustedPublicKeyHex: payload.signerPublicKeyHex,
        subjectReference,
      })
    ).resolves.toMatchObject({ deletionEventId: 'evt-1' });
    expect(query).toHaveBeenCalled();
  });

  it('signs when databaseVerifier reports absent', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:9');
    const payload = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-verifier',
      databaseVerifier: createTestDatabaseVerifier(async () => ({
        absent: true,
        checkedAtUnixMs: Date.now(),
      })),
    });
    expect(payload.signerPublicKeyHex).toHaveLength(64);
  });

  it('throws when wired DB check reports row still present', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:8');
    const query = vi.fn().mockResolvedValue({ rows: [{ found: 1 }] });
    await expect(
      offsign({
        identity,
        subjectReference,
        deletionEventId: 'evt-2',
        connection: { query },
        databaseType: 'postgres',
        tableOrCollection: 'contacts',
        data: '8',
      })
    ).rejects.toThrow(OffsignDeletionNotVerifiedError);
  });

  it('rejects offsign without wired props or databaseVerifier', async () => {
    const identity = Ed25519KeyIdentity.generate();
    await expect(
      offsign({
        identity,
        subjectReference: await sha256('no-db'),
        deletionEventId: 'evt-3',
        databaseVerifier: undefined as never,
      })
    ).rejects.toThrow(OffsignDatabaseVerifierRequiredError);
  });

  it('buildGoneproofDeletePayload is removed', async () => {
    const identity = Ed25519KeyIdentity.generate();
    await expect(
      buildGoneproofDeletePayload({
        identity,
        subjectReference: await sha256('legacy'),
        deletionEventId: 'evt-legacy',
      })
    ).rejects.toThrow(OffsignDatabaseVerifierRequiredError);
  });
});
