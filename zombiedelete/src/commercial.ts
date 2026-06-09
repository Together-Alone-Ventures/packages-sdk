import { variantKey, type CommercialPreflightStatus } from '@together-alone/zombiedelete-core';

export type AllowanceStatusView = CommercialPreflightStatus & {
  allowanceSeq: bigint;
  deploymentId: string | null;
  orgId: string | null;
  devBypass: boolean;
};

export type SecurityStatusView = {
  commercialStatus: string;
  deploymentId: string | null;
  orgId: string | null;
  moduleHash: Uint8Array | null;
  blockedReason: string | null;
  canEmit: boolean;
};

function mapAllowanceStatus(raw: Record<string, unknown>): AllowanceStatusView {
  const commercialStatus = variantKey(raw.commercial_status as Record<string, unknown>);
  const remaining = raw.remaining as bigint;
  const reserved = raw.reserved as bigint;
  return {
    commercialStatus,
    remaining,
    reserved,
    canEmit: false,
    blockedReason: null,
    allowanceSeq: raw.allowance_seq as bigint,
    deploymentId: (raw.deployment_id as [string] | [])[0] ?? null,
    orgId: (raw.org_id as [string] | [])[0] ?? null,
    devBypass: Boolean(raw.dev_bypass),
  };
}

function mapSecuritySurface(raw: Record<string, unknown>): SecurityStatusView {
  const moduleHashOpt = raw.module_hash as [Uint8Array] | [] | undefined;
  const moduleHash =
    moduleHashOpt && moduleHashOpt.length === 1 ? new Uint8Array(moduleHashOpt[0]) : null;
  return {
    commercialStatus: variantKey(raw.commercial_status as Record<string, unknown>),
    deploymentId: (raw.deployment_id as [string] | [])[0] ?? null,
    orgId: (raw.org_id as [string] | [])[0] ?? null,
    moduleHash,
    blockedReason: (raw.blocked_reason as [string] | [])[0] ?? null,
    canEmit: Boolean(raw.can_emit),
  };
}

export type CommercialActor = {
  get_allowance_status: () => Promise<Record<string, unknown>>;
  get_security_status: () => Promise<Record<string, unknown>>;
};

export async function queryAllowanceStatus(actor: CommercialActor): Promise<AllowanceStatusView> {
  const result = await actor.get_allowance_status();
  if ('Ok' in result) {
    return mapAllowanceStatus(result.Ok as Record<string, unknown>);
  }
  const errKey = variantKey(result.Err as Record<string, unknown>);
  throw new Error(`get_allowance_status_failed:${errKey}`);
}

export async function querySecurityStatus(actor: CommercialActor): Promise<SecurityStatusView> {
  const result = await actor.get_security_status();
  if ('Ok' in result) {
    return mapSecuritySurface(result.Ok as Record<string, unknown>);
  }
  const errKey = variantKey(result.Err as Record<string, unknown>);
  throw new Error(`get_security_status_failed:${errKey}`);
}

export function mergeCommercialPreflight(
  allowance: AllowanceStatusView,
  security: SecurityStatusView
): CommercialPreflightStatus {
  return {
    commercialStatus: security.commercialStatus,
    remaining: allowance.remaining,
    reserved: allowance.reserved,
    canEmit: security.canEmit,
    blockedReason: security.blockedReason,
  };
}
