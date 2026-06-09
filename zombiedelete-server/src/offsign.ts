import type { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  buildBackendDeletionAttestation,
  OffsignDatabaseVerifierRequiredError,
  OffsignDeletionNotVerifiedError,
  signBackendDeletionAttestation,
  type DatabaseVerifier,
  type OffsignDatabaseVerification,
  type SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete-core';
import {
  resolveDatabaseVerifier,
  runDatabaseAbsentCheck,
  verifyDeletionContextFromOffsignInput,
} from './databaseVerifier.js';

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

export type OffsignInput = BuildGoneproofDeletePayloadInput & {
  /** Dev/test only — skips live DB check (never use in production). */
  skipDatabaseVerification?: boolean;
} & OffsignDatabaseVerification;

async function buildAndSign(
  input: BuildGoneproofDeletePayloadInput
): Promise<SignedBackendDeletionAttestationV1> {
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

function signingInput(
  input: OffsignInput,
  verifier?: DatabaseVerifier
): BuildGoneproofDeletePayloadInput {
  return {
    identity: input.identity,
    subjectReference: input.subjectReference,
    deletionEventId: input.deletionEventId,
    deletedAtUnixMs: input.deletedAtUnixMs,
    sourceSystem: input.sourceSystem,
    sourceLocator: input.sourceLocator,
    dbEngine:
      input.dbEngine ??
      (verifier ? String(verifier.engine) : 'databaseType' in input ? input.databaseType : undefined),
    dbTransactionId: input.dbTransactionId,
  };
}

/**
 * Sign a backend deletion attestation after a read-only DB absence check.
 * Pass `connection`, `databaseType`, `tableOrCollection`, `data` directly, or a pre-built `databaseVerifier`.
 */
export async function offsign(input: OffsignInput): Promise<SignedBackendDeletionAttestationV1> {
  if (input.skipDatabaseVerification) {
    return buildAndSign(signingInput(input));
  }

  const verifier = resolveDatabaseVerifier(input);
  const ctx = verifyDeletionContextFromOffsignInput(input);
  const check = await runDatabaseAbsentCheck(verifier, ctx);
  if (!check.absent) {
    throw new OffsignDeletionNotVerifiedError(check.detail);
  }

  return buildAndSign(signingInput(input, verifier));
}

/**
 * @deprecated Use `offsign()` with wired DB props or `databaseVerifier`.
 */
export async function buildGoneproofDeletePayload(
  _input: BuildGoneproofDeletePayloadInput
): Promise<SignedBackendDeletionAttestationV1> {
  throw new OffsignDatabaseVerifierRequiredError(
    'buildGoneproofDeletePayload is removed — use offsign({ connection, databaseType, tableOrCollection, data, ... })'
  );
}

export type GoneproofDeletePayload = SignedBackendDeletionAttestationV1;
