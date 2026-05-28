import { describe, expect, it } from 'vitest';
import {
  deriveTransitionMaterial,
  encodeSemanticVersionBe,
  TRANSITION_DERIVATION_VERSION,
} from './transitionMaterial.js';

describe('deriveTransitionMaterial', () => {
  it('matches MKTd03 golden vector', async () => {
    const material = await deriveTransitionMaterial(
      new TextEncoder().encode('canonical-transition-source'),
      TRANSITION_DERIVATION_VERSION
    );
    expect(
      Array.from(material)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    ).toBe('bc739f3e9d65b8d8fa8e67368d798ab2580c6230341dc2cba0bb6211f6820bea');
  });

  it('encodes semantic version as 12-byte big-endian triple', () => {
    expect(Array.from(encodeSemanticVersionBe({ major: 1, minor: 2, patch: 3 }))).toEqual([
      0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 0, 3,
    ]);
  });
});
