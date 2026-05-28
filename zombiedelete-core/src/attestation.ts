import { Ed25519KeyIdentity, Ed25519PublicKey } from '@dfinity/identity';
import { bytesToHex } from './protocol.js';
import { deriveTransitionMaterial } from './transitionMaterial.js';
import type {
  BackendDeletionAttestationV1,
  SignedBackendDeletionAttestationV1,
} from './types.js';

export const BACKEND_ATTESTATION_SIGN_DOMAIN = 'mktd03-backend-deletion-attestation-v1';

export const ATTESTATION_EXTENSION_KEYS = {
  attestation: 'gd_v1_attestation',
  signatureHex: 'gd_v1_attestation_sig_hex',
  publicKeyHex: 'gd_v1_attestation_pubkey_hex',
  deletionEventId: 'gd_v1_deletion_event_id',
} as const;

/** Deterministic JSON (sorted keys) for cross-language signing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function attestationCanonicalBytes(
  attestation: BackendDeletionAttestationV1
): Uint8Array {
  return new TextEncoder().encode(canonicalJson(attestation));
}

export function attestationSigningMessage(
  attestation: BackendDeletionAttestationV1
): Uint8Array {
  const domain = new TextEncoder().encode(BACKEND_ATTESTATION_SIGN_DOMAIN);
  const body = attestationCanonicalBytes(attestation);
  const merged = new Uint8Array(domain.length + body.length);
  merged.set(domain, 0);
  merged.set(body, domain.length);
  return merged;
}

function parseHex32PublicKey(hex: string, label: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 64 hex characters (32-byte Ed25519 public key)`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function parseSignatureHex(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{128}$/.test(normalized)) {
    throw new Error('signatureHex must be 128 hex characters (64-byte Ed25519 signature)');
  }
  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function parseSubjectReferenceHex(hex: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('subjectReferenceHex must be 64 hex characters (32 bytes)');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function validateBackendDeletionAttestation(
  attestation: BackendDeletionAttestationV1
): void {
  if (attestation.v !== 1) {
    throw new Error(`Unsupported backend attestation version: ${String(attestation.v)}`);
  }
  if (!attestation.deletionEventId?.trim()) {
    throw new Error('deletionEventId is required');
  }
  if (!Number.isFinite(attestation.deletedAtUnixMs) || attestation.deletedAtUnixMs <= 0) {
    throw new Error('deletedAtUnixMs must be a positive unix timestamp in milliseconds');
  }
  parseSubjectReferenceHex(attestation.subjectReferenceHex);
}

export async function transitionMaterialFromAttestation(
  attestation: BackendDeletionAttestationV1
): Promise<Uint8Array> {
  validateBackendDeletionAttestation(attestation);
  return deriveTransitionMaterial(attestationCanonicalBytes(attestation));
}

export async function verifySignedBackendAttestation(
  signed: SignedBackendDeletionAttestationV1,
  options: {
    trustedPublicKeyHex?: string;
    subjectReference?: Uint8Array;
    maxAgeMs?: number;
  } = {}
): Promise<BackendDeletionAttestationV1> {
  validateBackendDeletionAttestation(signed.attestation);

  const trustedHex = options.trustedPublicKeyHex ?? signed.signerPublicKeyHex;
  if (!trustedHex?.trim()) {
    throw new Error('trustedPublicKeyHex or signed.signerPublicKeyHex is required');
  }
  if (
    options.trustedPublicKeyHex &&
    options.trustedPublicKeyHex.trim().toLowerCase() !==
      signed.signerPublicKeyHex.trim().toLowerCase()
  ) {
    throw new Error('Attestation signer does not match the trusted backend public key');
  }

  const subject = parseSubjectReferenceHex(signed.attestation.subjectReferenceHex);
  if (options.subjectReference) {
    if (bytesToHex(options.subjectReference) !== bytesToHex(subject)) {
      throw new Error('Attestation subjectReference does not match the expected subject');
    }
  }

  const maxAgeMs = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
  const ageMs = Date.now() - signed.attestation.deletedAtUnixMs;
  if (ageMs > maxAgeMs) {
    throw new Error('Backend attestation is too old for issuance');
  }
  if (ageMs < -60_000) {
    throw new Error('Backend attestation deletedAtUnixMs is in the future');
  }

  const publicKey = Ed25519PublicKey.fromRaw(parseHex32PublicKey(trustedHex, 'public key'));
  const signature = parseSignatureHex(signed.signatureHex);
  const message = attestationSigningMessage(signed.attestation);
  const ok = Ed25519KeyIdentity.verify(signature, message, publicKey.toRaw());
  if (!ok) {
    throw new Error('Invalid backend attestation signature');
  }

  return signed.attestation;
}

export async function signBackendDeletionAttestation(
  identity: Ed25519KeyIdentity,
  attestation: BackendDeletionAttestationV1
): Promise<SignedBackendDeletionAttestationV1> {
  validateBackendDeletionAttestation(attestation);
  const signature = await identity.sign(attestationSigningMessage(attestation));
  return {
    attestation,
    signatureHex: bytesToHex(signature),
    signerPublicKeyHex: bytesToHex(identity.getPublicKey().toRaw()),
  };
}

export function auditExtensionsFromSignedAttestation(
  signed: SignedBackendDeletionAttestationV1
): Array<[string, string]> {
  return [
    [ATTESTATION_EXTENSION_KEYS.attestation, canonicalJson(signed.attestation)],
    [ATTESTATION_EXTENSION_KEYS.signatureHex, signed.signatureHex],
    [ATTESTATION_EXTENSION_KEYS.publicKeyHex, signed.signerPublicKeyHex],
    [ATTESTATION_EXTENSION_KEYS.deletionEventId, signed.attestation.deletionEventId],
  ];
}

/** Build attestation on the client API after a successful DELETE. */
export async function buildBackendDeletionAttestation(input: {
  subjectReference: Uint8Array;
  deletionEventId: string;
  deletedAtUnixMs?: number;
  sourceSystem?: string;
  sourceLocator?: string;
  dbEngine?: string;
  dbTransactionId?: string;
}): Promise<BackendDeletionAttestationV1> {
  return {
    v: 1,
    subjectReferenceHex: bytesToHex(input.subjectReference),
    deletionEventId: input.deletionEventId.trim(),
    deletedAtUnixMs: input.deletedAtUnixMs ?? Date.now(),
    sourceSystem: input.sourceSystem?.trim() || undefined,
    sourceLocator: input.sourceLocator?.trim() || undefined,
    dbEngine: input.dbEngine?.trim() || undefined,
    dbTransactionId: input.dbTransactionId?.trim() || undefined,
  };
}

/** Verify attestation + recompute transition_material (for auditors / tooling). */
export async function verifyAttestationChain(input: {
  signed: SignedBackendDeletionAttestationV1;
  trustedPublicKeyHex?: string;
  transitionMaterial: Uint8Array;
}): Promise<{ attestation: BackendDeletionAttestationV1; subjectReference: Uint8Array }> {
  const attestation = await verifySignedBackendAttestation(input.signed, {
    trustedPublicKeyHex: input.trustedPublicKeyHex,
  });
  const subjectReference = parseSubjectReferenceHex(attestation.subjectReferenceHex);
  const expectedTransition = await transitionMaterialFromAttestation(attestation);
  if (bytesToHex(expectedTransition) !== bytesToHex(input.transitionMaterial)) {
    throw new Error('Receipt transition_material does not match the signed backend attestation');
  }
  return { attestation, subjectReference };
}
