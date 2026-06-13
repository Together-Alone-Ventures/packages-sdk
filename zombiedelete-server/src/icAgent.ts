import { HttpAgent, type Identity } from '@dfinity/agent';

export function normalizeIcHost(icHost: string): string {
  const trimmed = icHost.trim().replace(/\/$/, '');
  if (!trimmed) return 'http://127.0.0.1:4943';
  try {
    const u = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.toString().replace(/\/$/, '');
  } catch {
    return trimmed;
  }
}

export function needsFetchRootKey(host: string): boolean {
  try {
    const u = new URL(host.includes('://') ? host : `http://${host}`);
    const h = u.hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

export async function createIcAgent(icHost: string, identity?: Identity): Promise<HttpAgent> {
  const host = normalizeIcHost(icHost);
  const agent = new HttpAgent({ host, identity });
  if (needsFetchRootKey(host)) {
    await agent.fetchRootKey();
  }
  return agent;
}

export function formatControllerRejectError(
  error: unknown,
  canisterId: string | undefined,
  principalText: string
): string {
  const raw = error instanceof Error ? error.message : String(error);
  const isControllerReject =
    raw.includes('begin_tree_receipt_issuance') &&
    (raw.includes('IC0406') ||
      raw.includes('reject code: 4') ||
      raw.includes('Canister rejected the message'));
  if (!isControllerReject) return raw;

  const target = canisterId?.trim() || '<CANISTER_ID>';
  return [
    'Issuance rejected: signer is not a canister controller (MKTd03 v3.2).',
    `Signer (controller identity): ${principalText}`,
    'Expected: same principal as `dfx canister info` after deploy.',
    `Or: dfx canister update-settings ${target} --add-controller "${principalText}"`,
  ].join('\n');
}
