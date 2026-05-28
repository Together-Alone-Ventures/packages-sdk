import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it } from 'vitest';
import {
  attestationSigningMessage,
  auditExtensionsFromSignedAttestation,
  buildBackendDeletionAttestation,
  canonicalJson,
  signBackendDeletionAttestation,
  transitionMaterialFromAttestation,
  verifyAttestationChain,
  verifySignedBackendAttestation,
} from './attestation.js';
import { bytesToHex, sha256 } from './protocol.js';

describe('backend attestation v1', () => {
  it('uses deterministic canonical JSON', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('signs and verifies an attestation', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:42');
    const attestation = await buildBackendDeletionAttestation({
      subjectReference,
      deletionEventId: 'evt-123',
      deletedAtUnixMs: Date.now(),
      sourceSystem: 'CRM Acme',
      dbEngine: 'postgres',
      dbTransactionId: 'txn-9',
    });

    const signed = await signBackendDeletionAttestation(identity, attestation);
    const verified = await verifySignedBackendAttestation(signed, {
      trustedPublicKeyHex: signed.signerPublicKeyHex,
      subjectReference,
    });

    expect(verified.deletionEventId).toBe('evt-123');
    expect(verified.sourceSystem).toBe('CRM Acme');
  });

  it('rejects tampered attestations', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:42');
    const attestation = await buildBackendDeletionAttestation({
      subjectReference,
      deletionEventId: 'evt-123',
    });
    const signed = await signBackendDeletionAttestation(identity, attestation);
    signed.attestation.deletionEventId = 'evt-tampered';

    await expect(
      verifySignedBackendAttestation(signed, {
        trustedPublicKeyHex: signed.signerPublicKeyHex,
      })
    ).rejects.toThrow(/signature/i);
  });

  it('binds attestation to transition_material', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:42');
    const attestation = await buildBackendDeletionAttestation({
      subjectReference,
      deletionEventId: 'evt-bind',
      deletedAtUnixMs: Date.now(),
    });
    const signed = await signBackendDeletionAttestation(identity, attestation);
    const transitionMaterial = await transitionMaterialFromAttestation(attestation);

    await expect(
      verifyAttestationChain({
        signed,
        trustedPublicKeyHex: signed.signerPublicKeyHex,
        transitionMaterial,
      })
    ).resolves.toMatchObject({
      attestation: { deletionEventId: 'evt-bind' },
    });

    const wrongTransition = await sha256('wrong');
    await expect(
      verifyAttestationChain({
        signed,
        trustedPublicKeyHex: signed.signerPublicKeyHex,
        transitionMaterial: wrongTransition,
      })
    ).rejects.toThrow(/transition_material/i);
  });

  it('maps signed attestation to audit extensions', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('x');
    const attestation = await buildBackendDeletionAttestation({
      subjectReference,
      deletionEventId: 'evt-ext',
      deletedAtUnixMs: Date.now(),
    });
    const signed = await signBackendDeletionAttestation(identity, attestation);
    const extensions = auditExtensionsFromSignedAttestation(signed);
    expect(extensions.some(([k]) => k === 'gd_v1_attestation')).toBe(true);
    expect(extensions.some(([k, v]) => k === 'gd_v1_deletion_event_id' && v === 'evt-ext')).toBe(
      true
    );
  });

  it('prefixes attestation bytes with a stable signing domain', async () => {
    const attestation = await buildBackendDeletionAttestation({
      subjectReference: await sha256('x'),
      deletionEventId: 'evt-domain',
      deletedAtUnixMs: 1_700_000_000_000,
    });
    const message = attestationSigningMessage(attestation);
    expect(new TextDecoder().decode(message.subarray(0, 38))).toBe(
      'mktd03-backend-deletion-attestation-v1'
    );
    expect(message.length).toBeGreaterThan(40);
  });
});
