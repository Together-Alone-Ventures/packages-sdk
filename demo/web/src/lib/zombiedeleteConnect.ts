import {
  receiptSummary,
  sha256,
  type Receipt,
  type SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete-core';
import type { IssuanceProgress } from '@together-alone/zombiedelete-server';
import { fetchDemoApiConfig } from './demoApi';

import { DEMO_COMPANY } from '@demo-shared/company';

export { receiptSummary, sha256 };
export type { Receipt, IssuanceProgress, SignedBackendDeletionAttestationV1 };

async function demoSubjectPrefix(): Promise<string> {
  const config = await fetchDemoApiConfig();
  return config.subjectPrefix?.trim() || DEMO_COMPANY.subjectPrefix;
}

let cachedBackendPublicKeyHex: string | null = null;
let cachedApiConfig: Awaited<ReturnType<typeof fetchDemoApiConfig>> | null = null;

async function apiConfig() {
  if (!cachedApiConfig) {
    cachedApiConfig = await fetchDemoApiConfig();
  }
  return cachedApiConfig;
}

export function clearDemoApiConfigCache(): void {
  cachedApiConfig = null;
}

export function clearBackendPublicKeyCache(): void {
  cachedBackendPublicKeyHex = null;
}

const API_BASE =
  (import.meta.env.VITE_DEMO_API_URL as string | undefined)?.trim() || '/demo-api';

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function getIcHost(): string {
  return (import.meta.env.VITE_IC_HOST as string | undefined)?.trim() || 'https://icp-api.io';
}

export function signingModeLabel(): string {
  return 'API controller (server-side)';
}

export async function resolveTrustedBackendPublicKeyHex(): Promise<string> {
  const fromEnv = (import.meta.env.VITE_DEMO_BACKEND_PUBKEY_HEX as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  if (cachedBackendPublicKeyHex) return cachedBackendPublicKeyHex;
  const config = await fetchDemoApiConfig();
  cachedBackendPublicKeyHex = config.backendPublicKeyHex;
  return config.backendPublicKeyHex;
}

export async function connectDemoCanister(canisterId?: string): Promise<{
  status: string;
  controllerPrincipal: string;
  icHost: string;
  canisterId: string;
}> {
  const config = await apiConfig();
  const id = canisterId?.trim() || config.mktd03CanisterId?.trim() || '';
  if (!id) {
    throw new Error('MKTD03_CANISTER_ID missing. Set it in packages-sdk/demo/api/.env');
  }
  const qs = id ? `?canisterId=${encodeURIComponent(id)}` : '';
  const res = await fetch(`${API_BASE}/api/mktd03/status${qs}`);
  const data = (await res.json()) as {
    ok?: boolean;
    status?: string;
    controllerPrincipal?: string;
    icHost?: string;
    message?: string;
    detail?: string;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.status) {
    throw new Error(data.message ?? data.detail ?? data.error ?? res.statusText);
  }
  return {
    status: data.status,
    controllerPrincipal: data.controllerPrincipal ?? 'n/a',
    icHost: data.icHost ?? config.icHost ?? getIcHost(),
    canisterId: id,
  };
}

export async function demoSubjectReference(recordId: string): Promise<Uint8Array> {
  return sha256(`${await demoSubjectPrefix()}${recordId}`);
}

export async function issueDemoAttestedDeletionReceipt(
  engine: string,
  recordKey: string,
  onProgress?: (p: IssuanceProgress) => void,
  audit?: {
    subjectLabel?: string;
    dataCategory?: string;
    sourceSystem?: string;
    legalContext?: string;
  }
): Promise<{ offsign: SignedBackendDeletionAttestationV1; receipt: Receipt }> {
  onProgress?.({ step: 'begin', message: 'OffSign: DELETE + verify + sign + MKTd03…' });
  const res = await fetch(
    `${API_BASE}/api/${engine}/records/${encodeURIComponent(recordKey)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audit }),
    }
  );
  const body = (await res.json()) as {
    ok?: boolean;
    offsign?: SignedBackendDeletionAttestationV1;
    receipt?: Receipt;
    message?: string;
    error?: string;
  };
  if (!res.ok || !body.ok || !body.offsign || !body.receipt) {
    const err = body.message ?? body.error ?? 'offsign_delete_failed';
    if (err === 'not_mktd03_canister' || String(body.message ?? '').includes('does not respond as a full MKTd03')) {
      throw new Error(
        body.message ??
          'Invalid canister: use the MKTd03 ID deployed via the portal (not a local dfx canister).'
      );
    }
    throw new Error(body.message ?? err);
  }
  onProgress?.({ step: 'done', message: 'Deletion receipt issued via API.' });
  return { offsign: body.offsign, receipt: body.receipt };
}

export async function syncDemoReceipt(
  recordKey: string
): Promise<{ kind: string; receipt?: Receipt }> {
  const data = await parseJson<{
    ok: true;
    lookup: { kind: string; receipt?: Receipt };
  }>(
    await fetch(
      `${API_BASE}/api/mktd03/receipt?recordKey=${encodeURIComponent(recordKey)}`
    )
  );
  return data.lookup;
}

export async function guardDemoRestore(
  engine: string,
  recordId: string
): Promise<string | null> {
  const data = await parseJson<{
    ok: true;
    allowed: boolean;
    reason?: string;
    message?: string;
  }>(
    await fetch(
      `${API_BASE}/api/mktd03/restore-guard?engine=${encodeURIComponent(engine)}&recordKey=${encodeURIComponent(recordId)}`
    )
  );
  if (!data.allowed) {
    if (data.reason === 'tombstoned_on_chain') {
      return 'Restore blocked: subject tombstoned on MKTd03.';
    }
    return data.message ?? 'Restore blocked: subject listed in local deletion registry.';
  }
  return null;
}

export function formatIssuanceAgentError(
  _client: unknown,
  error: unknown,
  canisterId?: string
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
    'Issuance rejected: API controller is not a canister controller (MKTd03 v3.2).',
    raw,
    `Or: dfx canister update-settings ${target} --add-controller "<CONTROLLER_PRINCIPAL>"`,
  ].join('\n');
}

export function getActiveSignerPrincipalText(controllerPrincipal?: string | null): string {
  return controllerPrincipal?.trim() || 'n/a';
}

export function clearSignerSession(): void {
  /* no browser signing session in API-only demo */
}
