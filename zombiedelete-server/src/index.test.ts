import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it } from 'vitest';
import { buildGoneproofDeletePayload } from './index.js';
import { sha256, verifySignedBackendAttestation } from '@together-alone/zombiedelete-core';

describe('zombiedelete-server', () => {
  it('buildGoneproofDeletePayload produces a verifiable attestation', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:7');
    const payload = await buildGoneproofDeletePayload({
      identity,
      subjectReference,
      deletionEventId: 'evt-server-1',
      sourceSystem: 'CRM',
      dbEngine: 'postgres',
    });

    await expect(
      verifySignedBackendAttestation(payload, {
        trustedPublicKeyHex: payload.signerPublicKeyHex,
        subjectReference,
      })
    ).resolves.toMatchObject({ deletionEventId: 'evt-server-1' });
  });
});
