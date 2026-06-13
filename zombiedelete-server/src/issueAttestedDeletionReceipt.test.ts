import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it } from 'vitest';
import { sha256 } from '@together-alone/zombiedelete-core';
import { offsign } from './offsign.js';
import { issueAttestedDeletionReceipt } from './issueAttestedDeletionReceipt.js';

describe('issueAttestedDeletionReceipt', () => {
  it('rejects invalid attestation before IC calls', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('server:subject:1');
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-1',
      skipDatabaseVerification: true,
    });

    const tampered = {
      ...signed,
      signatureHex: `${'0'.repeat(128)}`,
    };

    await expect(
      issueAttestedDeletionReceipt({
        canisterId: 'aaaaa-aa',
        icHost: 'http://127.0.0.1:4943',
        controllerIdentity: identity,
        signedAttestation: tampered,
        trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
        skipPreflight: true,
      })
    ).rejects.toThrow();
  });

  it('requires canisterId', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const signed = await offsign({
      identity,
      subjectReference: await sha256('x'),
      deletionEventId: 'evt-2',
      skipDatabaseVerification: true,
    });

    await expect(
      issueAttestedDeletionReceipt({
        canisterId: '  ',
        icHost: 'http://127.0.0.1:4943',
        controllerIdentity: identity,
        signedAttestation: signed,
        skipPreflight: true,
      })
    ).rejects.toThrow(/canisterId is required/);
  });
});
