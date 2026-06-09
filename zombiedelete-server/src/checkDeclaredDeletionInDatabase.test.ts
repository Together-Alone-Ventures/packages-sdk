import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it, vi } from 'vitest';
import { OffsignDatabaseVerifierRequiredError, sha256 } from '@together-alone/zombiedelete-core';
import { offsign } from './offsign.js';
import { checkDeclaredDeletionInDatabase } from './checkDeclaredDeletionInDatabase.js';

function postgresConnection(absent: boolean) {
  return {
    query: vi.fn().mockResolvedValue({ rows: absent ? [] : [{ found: 1 }] }),
  };
}

describe('checkDeclaredDeletionInDatabase', () => {
  it('reports ok with inline wired DB props', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('check:1');
    const connection = postgresConnection(true);
    const wired = {
      connection,
      databaseType: 'postgres' as const,
      tableOrCollection: 'users',
      data: { keyField: 'id', keyValue: '42' },
    };
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-check-1',
      sourceLocator: 'users/42',
      ...wired,
    });

    const result = await checkDeclaredDeletionInDatabase({
      signedAttestation: signed,
      trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
      ...wired,
    });

    expect(result.attestationVerified).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.absent).toBe(true);
  });

  it('reports mismatch when DB still has the row', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('check:2');
    const signConn = postgresConnection(true);
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-check-2',
      connection: signConn,
      databaseType: 'postgres',
      tableOrCollection: 'users',
      data: '99',
    });

    const result = await checkDeclaredDeletionInDatabase({
      signedAttestation: signed,
      trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
      connection: postgresConnection(false),
      databaseType: 'postgres',
      tableOrCollection: 'users',
      data: '99',
    });

    expect(result.attestationVerified).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.detail).toBe('postgres_row_still_visible');
  });

  it('requires wired props or databaseVerifier', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('check:3');
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-check-3',
      connection: postgresConnection(true),
      databaseType: 'postgres',
      tableOrCollection: 'users',
      data: '1',
    });

    await expect(
      checkDeclaredDeletionInDatabase({
        signedAttestation: signed,
        databaseVerifier: undefined as never,
      })
    ).rejects.toThrow(OffsignDatabaseVerifierRequiredError);
  });
});
