import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it, vi } from 'vitest';
import {
  sha256,
  transitionMaterialFromAttestation,
  verifySignedBackendAttestation,
  type Receipt,
  type SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete-core';
import { offsign } from './offsign.js';
import { attestDeletionProof } from './attestDeletionProof.js';
import { issueDeletionCertificate } from './issueDeletionCertificate.js';
import * as renderModule from './renderAuditPdfOnCanister.js';

function postgresConnection(absent: boolean) {
  return {
    query: vi.fn().mockResolvedValue({ rows: absent ? [] : [{ found: 1 }] }),
  };
}

const minimalReceipt = (
  subjectReference: Uint8Array,
  transitionMaterial: Uint8Array
): Receipt => ({
  protocol_version: { major: 1, minor: 0, patch: 0 },
  receipt_version: { major: 1, minor: 0, patch: 0 },
  core_transition_evidence: {
    subject_reference: subjectReference,
    pre_state_commitment: new Uint8Array(32),
    post_state_commitment: new Uint8Array(32),
    transition_material: transitionMaterial,
    tree_proof: new Uint8Array(3),
    deletion_state_material: { tombstoned_position: new Uint8Array(32) },
  },
});

async function receiptForSigned(
  subjectReference: Uint8Array,
  signed: SignedBackendDeletionAttestationV1
): Promise<Receipt> {
  const verified = await verifySignedBackendAttestation(signed, {
    trustedPublicKeyHex: signed.signerPublicKeyHex,
  });
  const transitionMaterial = await transitionMaterialFromAttestation(verified);
  return minimalReceipt(subjectReference, transitionMaterial);
}

describe('attestDeletionProof', () => {
  it('requires receipt and runs DB check', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('attest:1');
    const wired = {
      connection: postgresConnection(true),
      databaseType: 'postgres' as const,
      tableOrCollection: 'users',
      data: { keyField: 'id', keyValue: '42' },
    };
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-attest-1',
      ...wired,
    });

    const result = await attestDeletionProof({
      signedAttestation: signed,
      receipt: await receiptForSigned(subjectReference, signed),
      trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
      ...wired,
    });

    expect(result.ok).toBe(true);
    expect(result.receiptBindingOk).toBe(true);
  });
});

describe('issueDeletionCertificate', () => {
  it('refuses certificate when DB check fails', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('cert:1');
    const signConn = postgresConnection(true);
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-cert-1',
      connection: signConn,
      databaseType: 'postgres',
      tableOrCollection: 'users',
      data: '99',
    });

    const renderSpy = vi.spyOn(renderModule, 'renderAuditPdfOnCanister');

    await expect(
      issueDeletionCertificate({
        signedAttestation: signed,
        receipt: await receiptForSigned(subjectReference, signed),
        trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
        connection: postgresConnection(false),
        databaseType: 'postgres',
        tableOrCollection: 'users',
        data: '99',
        canisterId: 'aaaaa-aa',
        icHost: 'http://127.0.0.1:4943',
        auditorHmacKeyHex: '11'.repeat(64),
      })
    ).rejects.toThrow(/postgres_row_still_visible|deletion_proof_db_attestation_failed/);

    expect(renderSpy).not.toHaveBeenCalled();
    renderSpy.mockRestore();
  });

  it('returns PDF after successful DB attestation', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const subjectReference = await sha256('cert:2');
    const wired = {
      connection: postgresConnection(true),
      databaseType: 'postgres' as const,
      tableOrCollection: 'users',
      data: { keyField: 'id', keyValue: '7' },
    };
    const signed = await offsign({
      identity,
      subjectReference,
      deletionEventId: 'evt-cert-2',
      ...wired,
    });

    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const renderSpy = vi
      .spyOn(renderModule, 'renderAuditPdfOnCanister')
      .mockResolvedValue(fakePdf);

    const out = await issueDeletionCertificate({
      signedAttestation: signed,
      receipt: await receiptForSigned(subjectReference, signed),
      trustedBackendPublicKeyHex: signed.signerPublicKeyHex,
      ...wired,
      canisterId: 'aaaaa-aa',
      icHost: 'http://127.0.0.1:4943',
      auditorHmacKeyHex: '11'.repeat(64),
    });

    expect(out.attestation.ok).toBe(true);
    expect(out.pdf).toEqual(fakePdf);
    renderSpy.mockRestore();
  });
});
