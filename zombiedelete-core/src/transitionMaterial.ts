import { sha256 } from './protocol.js';
import type { SemanticVersion } from './types.js';

const TAG_TRANSITION_MATERIAL = new TextEncoder().encode('MKTD03_TRANSITION_MATERIAL_V1');

/** Pinned MKTd03 §4.4 derivation version (matches canister `version_1_0_0`). */
export const TRANSITION_DERIVATION_VERSION: SemanticVersion = {
  major: 1,
  minor: 0,
  patch: 0,
};

export function encodeSemanticVersionBe(version: SemanticVersion): Uint8Array {
  const out = new Uint8Array(12);
  const view = new DataView(out.buffer);
  view.setUint32(0, version.major, false);
  view.setUint32(4, version.minor, false);
  view.setUint32(8, version.patch, false);
  return out;
}

async function hashWithTag(tag: Uint8Array, parts: Uint8Array[]): Promise<Uint8Array> {
  const total = tag.length + parts.reduce((n, p) => n + p.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  merged.set(tag, offset);
  offset += tag.length;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  return sha256(merged);
}

/** Matches `transition_material::derive_transition_material` in MKTd03. */
export async function deriveTransitionMaterial(
  canonicalTransitionSourceBytes: Uint8Array,
  transitionDerivationVersion: SemanticVersion = TRANSITION_DERIVATION_VERSION
): Promise<Uint8Array> {
  return hashWithTag(TAG_TRANSITION_MATERIAL, [
    encodeSemanticVersionBe(transitionDerivationVersion),
    canonicalTransitionSourceBytes,
  ]);
}
