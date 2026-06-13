import { describe, expect, it } from 'vitest';
import { preflightCommercial } from './preflightCommercial.js';
import type { CommercialActor } from './commercial.js';

function mockActor(allowance: Record<string, unknown>, security: Record<string, unknown>): CommercialActor {
  return {
    get_allowance_status: async () => allowance,
    get_security_status: async () => security,
  };
}

describe('preflightCommercial', () => {
  it('passes when operational with credits and can_emit', async () => {
    const result = await preflightCommercial(
      mockActor(
        {
          Ok: {
            commercial_status: { operational: null },
            remaining: 5n,
            reserved: 0n,
            allowance_seq: 1n,
            deployment_id: [],
            org_id: [],
            dev_bypass: false,
          },
        },
        {
          Ok: {
            security_status: { operational: null },
            commercial_status: [{ operational: null }],
            deployment_id: [],
            org_id: [],
            module_hash: [],
            blocked_reason: [],
            can_emit: true,
          },
        }
      )
    );
    expect(result.ok).toBe(true);
  });

  it('blocks when exhausted', async () => {
    const result = await preflightCommercial(
      mockActor(
        {
          Ok: {
            commercial_status: { exhausted: null },
            remaining: 0n,
            reserved: 0n,
            allowance_seq: 1n,
            deployment_id: [],
            org_id: [],
            dev_bypass: false,
          },
        },
        {
          Ok: {
            security_status: { operational: null },
            commercial_status: [{ exhausted: null }],
            deployment_id: [],
            org_id: [],
            module_hash: [],
            blocked_reason: ['commercial_gate_failed'],
            can_emit: false,
          },
        }
      )
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('exhausted');
    }
  });

  it('passes when commercial is disabled on canister', async () => {
    const result = await preflightCommercial(
      mockActor({ Err: { commercial_disabled: null } }, { Err: { commercial_disabled: null } })
    );
    expect(result.ok).toBe(true);
  });

  it('passes security-only when billing not configured but security can_emit', async () => {
    const result = await preflightCommercial(
      mockActor(
        {
          Ok: {
            commercial_status: { not_configured: null },
            remaining: 0n,
            reserved: 0n,
            allowance_seq: 0n,
            deployment_id: [],
            org_id: [],
            dev_bypass: false,
          },
        },
        {
          Ok: {
            security_status: { dev_bypass: null },
            commercial_status: [],
            deployment_id: ['dev-bypass'],
            org_id: ['dev-bypass'],
            module_hash: [],
            blocked_reason: [],
            can_emit: true,
          },
        }
      )
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.allowance.commercialStatus).toBe('not_applicable');
      expect(result.allowance.canEmit).toBe(true);
    }
  });
});
