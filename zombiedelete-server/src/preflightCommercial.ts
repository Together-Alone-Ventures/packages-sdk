import {
  OffSignCommercialError,
  type OffSignCommercialErrorCode,
  type SecurityPreflightResult,
} from '@together-alone/zombiedelete-core';
import {
  mergeCommercialPreflight,
  queryAllowanceStatus,
  querySecurityStatus,
  type CommercialActor,
} from './commercial.js';
import { variantKey } from '@together-alone/zombiedelete-core';

const EMIT_OK_STATUSES = new Set(['operational', 'dev_bypass']);
const SECURITY_EMIT_OK = new Set(['operational', 'dev_bypass']);

function isBillingDisabled(
  allowance: { commercialStatus: string },
  security: { commercialStatus: string | null }
): boolean {
  return (
    security.commercialStatus === null ||
    allowance.commercialStatus === 'not_configured'
  );
}

function messageForCode(code: OffSignCommercialErrorCode, status: string): string {
  switch (code) {
    case 'exhausted':
      return 'Commercial allowance exhausted — no credits remaining for issuance.';
    case 'awaiting_first_injection':
      return 'Canister awaiting first allowance injection.';
    case 'clone_detected':
      return 'Clone suspected — issuance blocked by security surface.';
    case 'revoked':
      return 'Commercial allowance revoked.';
    case 'init_rejected':
      return 'Canister commercial init rejected — DeployAuth required.';
    case 'expired':
      return 'Commercial allowance expired.';
    case 'no_credits':
      return 'No credits available (remaining minus reserved is zero).';
    case 'lookup_failed':
      return 'Commercial preflight lookup failed.';
    default:
      return `Commercial gate blocked issuance (${status}).`;
  }
}

function resolveBlockedCode(
  allowance: { commercialStatus: string; remaining: bigint; reserved: bigint },
  security: {
    securityStatus: string;
    commercialStatus: string | null;
    canEmit: boolean;
    blockedReason: string | null;
  }
): OffSignCommercialErrorCode {
  if (security.securityStatus === 'clone_suspected') return 'clone_detected';
  if (security.securityStatus === 'init_rejected') return 'init_rejected';
  const status = security.commercialStatus ?? allowance.commercialStatus;
  if (status === 'exhausted') return 'exhausted';
  if (status === 'awaiting_first_injection') return 'awaiting_first_injection';
  if (status === 'clone_suspected') return 'clone_detected';
  if (status === 'revoked') return 'revoked';
  if (status === 'init_rejected') return 'init_rejected';
  if (status === 'expired') return 'expired';
  const free = allowance.remaining - allowance.reserved;
  if (free < 1n) return 'no_credits';
  if (!security.canEmit) {
    const reason = security.blockedReason ?? '';
    if (reason.includes('exhausted')) return 'exhausted';
    if (reason.includes('awaiting')) return 'awaiting_first_injection';
    if (reason.includes('clone')) return 'clone_detected';
    return 'commercial_gate_failed';
  }
  if (!EMIT_OK_STATUSES.has(status)) return 'commercial_gate_failed';
  return 'commercial_gate_failed';
}

export async function preflightCommercial(actor: CommercialActor): Promise<SecurityPreflightResult> {
  try {
    const allowanceRaw = await actor.get_allowance_status();
    if ('Err' in allowanceRaw) {
      const errKey = variantKey(allowanceRaw.Err as Record<string, unknown>);
      if (errKey === 'commercial_disabled') {
        return {
          ok: true,
          allowance: {
            commercialStatus: 'not_applicable',
            remaining: 0n,
            reserved: 0n,
            canEmit: true,
            blockedReason: null,
          },
        };
      }
      throw new Error(`get_allowance_status_failed:${errKey}`);
    }

    const allowance = await queryAllowanceStatus(actor);
    const securityRaw = await actor.get_security_status();
    if ('Err' in securityRaw) {
      const errKey = variantKey(securityRaw.Err as Record<string, unknown>);
      if (errKey === 'commercial_disabled') {
        return {
          ok: true,
          allowance: mergeCommercialPreflight(allowance, {
            securityStatus: 'not_configured',
            commercialStatus: null,
            deploymentId: null,
            orgId: null,
            moduleHash: null,
            blockedReason: null,
            canEmit: true,
          }),
        };
      }
      throw new Error(`get_security_status_failed:${errKey}`);
    }

    const security = await querySecurityStatus(actor);
    const merged = mergeCommercialPreflight(allowance, security);

    if (isBillingDisabled(allowance, security)) {
      const securityOk =
        security.canEmit && SECURITY_EMIT_OK.has(security.securityStatus);
      if (securityOk) {
        return {
          ok: true,
          allowance: {
            ...merged,
            commercialStatus: 'not_applicable',
            canEmit: true,
            blockedReason: null,
          },
        };
      }
      const code = resolveBlockedCode(allowance, security);
      const message = messageForCode(code, security.securityStatus);
      return { ok: false, code, message, allowance: merged };
    }

    const free = merged.remaining - merged.reserved;
    const statusOk = EMIT_OK_STATUSES.has(merged.commercialStatus);
    if (merged.canEmit && statusOk && free >= 1n) {
      return { ok: true, allowance: merged };
    }
    const code = resolveBlockedCode(allowance, security);
    const message = messageForCode(code, merged.commercialStatus);
    return { ok: false, code, message, allowance: merged };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const allowance = {
      commercialStatus: 'unknown',
      remaining: 0n,
      reserved: 0n,
      canEmit: false,
      blockedReason: message,
    };
    return {
      ok: false,
      code: 'lookup_failed',
      message,
      allowance,
    };
  }
}

export async function assertCommercialPreflight(actor: CommercialActor): Promise<void> {
  const result = await preflightCommercial(actor);
  if (!result.ok) {
    throw new OffSignCommercialError(result.code, result.message, result);
  }
}
