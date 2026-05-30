import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it } from 'vitest';
import {
  attestationAuditExtensionHex,
  attestationHexExtensionEntries,
  attestationSigningMessage,
  auditExtensionsFromSignedAttestation,
  buildBackendDeletionAttestation,
  canonicalJson,
  joinAttestationHexExtensionEntries,
  signBackendDeletionAttestation,
  transitionMaterialFromAttestation,
  validateMktd03AuditExtensions,
  validateMktd03DeletionAuditInput,
  verifyAttestationChain,
  verifySignedBackendAttestation,
} from './attestation.js';
import { bytesToHex, sha256 } from './protocol.js';

describe('backend attestation v1', () => {
  it('uses deterministic canonical JSON', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalJson({ a: 1, optional: undefined })).toBe('{"a":1}');
  });

  it('verifies after JSON roundtrip (HTTP DELETE response shape)', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:42');
    const attestation = await buildBackendDeletionAttestation({
      subjectReference,
      deletionEventId: 'evt-json',
      deletedAtUnixMs: Date.now(),
      sourceSystem: 'CRM Acme',
      dbEngine: 'postgres',
    });
    const signed = await signBackendDeletionAttestation(identity, attestation);
    const viaJson = JSON.parse(JSON.stringify(signed)) as typeof signed;

    await expect(
      verifySignedBackendAttestation(viaJson, {
        trustedPublicKeyHex: signed.signerPublicKeyHex,
        subjectReference,
      })
    ).resolves.toMatchObject({ deletionEventId: 'evt-json' });
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

  it('chunks attestation hex for MKTd03 extension size limits', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('tenant:users:42');
    const attestation = await buildBackendDeletionAttestation({
      subjectReference,
      deletionEventId: crypto.randomUUID(),
      deletedAtUnixMs: Date.now(),
      sourceSystem: 'Infoshare booth demo API',
      dbEngine: 'mysql',
      dbTransactionId: 'mysql:badge-48291-anna-kowalska:1780132191394',
    });
    const signed = await signBackendDeletionAttestation(identity, attestation);
    const extensions = auditExtensionsFromSignedAttestation(signed);
    expect(extensions.some(([k]) => k === 'gd_v1_attestation')).toBe(false);
    expect(extensions.some(([k]) => k === 'gd_v1_attestation_p0')).toBe(true);
    expect(() => validateMktd03AuditExtensions(extensions)).not.toThrow();
    const joined = joinAttestationHexExtensionEntries(extensions);
    expect(joined).toBe(attestationAuditExtensionHex(signed.attestation));
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
    const attestationExt = extensions.find(([k]) => k === 'gd_v1_attestation')?.[1];
    expect(attestationExt).toMatch(/^[0-9a-f]+$/);
    expect(attestationExt).toBe(attestationAuditExtensionHex(signed.attestation));
    expect(extensions.some(([k, v]) => k === 'gd_v1_deletion_event_id' && v === 'evtext')).toBe(
      true
    );
    expect(() =>
      validateMktd03DeletionAuditInput({
        subjectLabel: 'Demo attendee',
        legalContext: 'GDPR Art. 17 - demo',
        extensions,
      })
    ).not.toThrow();
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
