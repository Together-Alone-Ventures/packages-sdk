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
  attestationParts: 'gd_v1_attestation_parts',
} as const;

/** MKTd03 `set_audit_metadata.extensions` limits (audit_record.rs). */
export const MKTD03_AUDIT_EXTENSION_KEY_MAX = 128;
export const MKTD03_AUDIT_EXTENSION_VALUE_MAX = 512;
export const MKTD03_AUDIT_SUBJECT_LABEL_MAX = 512;
export const MKTD03_AUDIT_LEGAL_CONTEXT_MAX = 2048;
export const MKTD03_AUDIT_SOURCE_LOCATOR_MAX = 512;

const ATTESTATION_EXTENSION_CHUNK_PREFIX = `${ATTESTATION_EXTENSION_KEYS.attestation}_p`;

/** Deterministic JSON (sorted keys) for cross-language signing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
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

/** Hex-encode attestation bytes so MKTd03 metadata PII filters do not reject JSON/UUID shapes. */
export function attestationAuditExtensionHex(
  attestation: BackendDeletionAttestationV1
): string {
  return bytesToHex(attestationCanonicalBytes(attestation));
}

export function deletionEventIdAuditExtensionValue(deletionEventId: string): string {
  return deletionEventId.trim().replace(/-/g, '');
}

function rejectIfMktd03Oversized(value: string, max: number, label: string): void {
  if (value.length > max) {
    throw new Error(`${label} exceeds MKTd03 limit (${value.length} > ${max} chars)`);
  }
}

function rejectIfMktd03PiiPattern(value: string, label: string): void {
  const lower = value.toLowerCase();
  if (lower.includes('@') && lower.includes('.')) {
    throw new Error(`${label} matches an email-like pattern rejected by MKTd03 audit metadata`);
  }
  const digits = [...lower].filter((c) => c >= '0' && c <= '9').length;
  if (
    (digits >= 10 && lower.includes('+')) ||
    (digits >= 10 && [...lower].some((c) => c === '-' || c === ' '))
  ) {
    throw new Error(`${label} matches a phone-like pattern rejected by MKTd03 audit metadata`);
  }
  const digitRun = [...lower].filter((c) => c >= '0' && c <= '9').join('');
  if (digitRun.length === 9) {
    throw new Error(`${label} matches an SSN-like pattern rejected by MKTd03 audit metadata`);
  }
}

/** Validate extension tuples before `set_audit_metadata` (fail fast, before on-chain begin). */
export function validateMktd03AuditExtensions(
  extensions: Array<[string, string]>
): void {
  for (const [key, value] of extensions) {
    rejectIfMktd03Oversized(key, MKTD03_AUDIT_EXTENSION_KEY_MAX, `Audit extension key "${key}"`);
    rejectIfMktd03Oversized(
      value,
      MKTD03_AUDIT_EXTENSION_VALUE_MAX,
      `Audit extension "${key}"`
    );
    rejectIfMktd03PiiPattern(key, `Audit extension key "${key}"`);
    rejectIfMktd03PiiPattern(value, `Audit extension "${key}"`);
  }
}

export function validateMktd03DeletionAuditInput(input: {
  subjectLabel?: string;
  legalContext?: string;
  sourceLocator?: string;
  extensions?: Array<[string, string]>;
}): void {
  if (input.subjectLabel?.trim()) {
    rejectIfMktd03Oversized(
      input.subjectLabel,
      MKTD03_AUDIT_SUBJECT_LABEL_MAX,
      'Audit subject label'
    );
    rejectIfMktd03PiiPattern(input.subjectLabel, 'Audit subject label');
  }
  if (input.legalContext?.trim()) {
    rejectIfMktd03Oversized(
      input.legalContext,
      MKTD03_AUDIT_LEGAL_CONTEXT_MAX,
      'Audit legal context'
    );
    rejectIfMktd03PiiPattern(input.legalContext, 'Audit legal context');
  }
  if (input.sourceLocator?.trim()) {
    rejectIfMktd03Oversized(
      input.sourceLocator,
      MKTD03_AUDIT_SOURCE_LOCATOR_MAX,
      'Audit source locator'
    );
    rejectIfMktd03PiiPattern(input.sourceLocator, 'Audit source locator');
  }
  if (input.extensions?.length) {
    validateMktd03AuditExtensions(input.extensions);
  }
}

export function attestationHexExtensionEntries(hex: string): Array<[string, string]> {
  if (hex.length <= MKTD03_AUDIT_EXTENSION_VALUE_MAX) {
    return [[ATTESTATION_EXTENSION_KEYS.attestation, hex]];
  }
  const chunks: Array<[string, string]> = [];
  for (let offset = 0; offset < hex.length; offset += MKTD03_AUDIT_EXTENSION_VALUE_MAX) {
    chunks.push([
      `${ATTESTATION_EXTENSION_CHUNK_PREFIX}${chunks.length}`,
      hex.slice(offset, offset + MKTD03_AUDIT_EXTENSION_VALUE_MAX),
    ]);
  }
  chunks.push([ATTESTATION_EXTENSION_KEYS.attestationParts, String(chunks.length)]);
  return chunks;
}

/** Reassemble chunked attestation hex stored in MKTd03 audit extensions. */
export function joinAttestationHexExtensionEntries(
  extensions: Array<[string, string]>
): string | null {
  const single = extensions.find(([k]) => k === ATTESTATION_EXTENSION_KEYS.attestation)?.[1];
  if (single) return single;
  const partCount = Number(
    extensions.find(([k]) => k === ATTESTATION_EXTENSION_KEYS.attestationParts)?.[1] ?? '0'
  );
  if (!Number.isFinite(partCount) || partCount <= 0) return null;
  let hex = '';
  for (let i = 0; i < partCount; i += 1) {
    const part = extensions.find(([k]) => k === `${ATTESTATION_EXTENSION_CHUNK_PREFIX}${i}`)?.[1];
    if (!part) return null;
    hex += part;
  }
  return hex;
}

export function auditExtensionsFromSignedAttestation(
  signed: SignedBackendDeletionAttestationV1
): Array<[string, string]> {
  const hex = attestationAuditExtensionHex(signed.attestation);
  return [
    ...attestationHexExtensionEntries(hex),
    [ATTESTATION_EXTENSION_KEYS.signatureHex, signed.signatureHex],
    [ATTESTATION_EXTENSION_KEYS.publicKeyHex, signed.signerPublicKeyHex],
    [
      ATTESTATION_EXTENSION_KEYS.deletionEventId,
      deletionEventIdAuditExtensionValue(signed.attestation.deletionEventId),
    ],
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
  const attestation: BackendDeletionAttestationV1 = {
    v: 1,
    subjectReferenceHex: bytesToHex(input.subjectReference),
    deletionEventId: input.deletionEventId.trim(),
    deletedAtUnixMs: input.deletedAtUnixMs ?? Date.now(),
  };
  const sourceSystem = input.sourceSystem?.trim();
  if (sourceSystem) attestation.sourceSystem = sourceSystem;
  const sourceLocator = input.sourceLocator?.trim();
  if (sourceLocator) attestation.sourceLocator = sourceLocator;
  const dbEngine = input.dbEngine?.trim();
  if (dbEngine) attestation.dbEngine = dbEngine;
  const dbTransactionId = input.dbTransactionId?.trim();
  if (dbTransactionId) attestation.dbTransactionId = dbTransactionId;
  return attestation;
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
