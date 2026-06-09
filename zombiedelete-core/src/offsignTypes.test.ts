import { describe, expect, it } from 'vitest';
import { OffSignCommercialError } from './offsignTypes.js';

describe('offsignTypes', () => {
  it('OffSignCommercialError carries code and preflight', () => {
    const preflight = {
      ok: false as const,
      code: 'exhausted' as const,
      message: 'No credits',
      allowance: {
        commercialStatus: 'exhausted',
        remaining: 0n,
        reserved: 0n,
        canEmit: false,
        blockedReason: 'exhausted',
      },
    };
    const err = new OffSignCommercialError('exhausted', 'No credits', preflight);
    expect(err.code).toBe('exhausted');
    expect(err.preflight).toEqual(preflight);
  });
});
