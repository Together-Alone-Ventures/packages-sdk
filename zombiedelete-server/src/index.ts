import type { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  buildBackendDeletionAttestation,
  signBackendDeletionAttestation,
  type SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete-core';

export type GoneproofDeletePayload = SignedBackendDeletionAttestationV1;

export type BuildGoneproofDeletePayloadInput = {
  identity: Ed25519KeyIdentity;
  subjectReference: Uint8Array;
  deletionEventId: string;
  deletedAtUnixMs?: number;
  sourceSystem?: string;
  sourceLocator?: string;
  dbEngine?: string;
  dbTransactionId?: string;
};

/** Sign attestation after a successful DB delete — attach as `goneproof` on the DELETE response. */
export async function buildGoneproofDeletePayload(
  input: BuildGoneproofDeletePayloadInput
): Promise<GoneproofDeletePayload> {
  const attestation = await buildBackendDeletionAttestation({
    subjectReference: input.subjectReference,
    deletionEventId: input.deletionEventId,
    deletedAtUnixMs: input.deletedAtUnixMs,
    sourceSystem: input.sourceSystem,
    sourceLocator: input.sourceLocator,
    dbEngine: input.dbEngine,
    dbTransactionId: input.dbTransactionId,
  });
  return signBackendDeletionAttestation(input.identity, attestation);
}

export {
  buildBackendDeletionAttestation,
  signBackendDeletionAttestation,
  validateBackendDeletionAttestation,
  canonicalJson,
  attestationSigningMessage,
  attestationCanonicalBytes,
  ATTESTATION_EXTENSION_KEYS,
  BACKEND_ATTESTATION_SIGN_DOMAIN,
  sha256,
  deriveTransitionMaterial,
  TRANSITION_DERIVATION_VERSION,
} from '@together-alone/zombiedelete-core';

export type {
  BackendDeletionAttestationV1,
  SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete-core';
