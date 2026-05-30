import {
  ZombieDeleteClient,
  isLocalReplicaHost,
  receiptSummary,
  resolveAgentHost,
  sha256,
  type DeletionAuditMetadata,
  type IssuanceProgress,
  type Receipt,
  type SignedBackendDeletionAttestationV1,
} from '@together-alone/zombiedelete';
import localDevIcIdentity from '@demo-shared/local-dev-ic-identity.json';
import localDevAuditorKey from '@demo-shared/local-dev-auditor-hmac-key.json';
import { fetchDemoApiConfig } from './demoApi';

export { receiptSummary, sha256 };
export type { Receipt, IssuanceProgress, SignedBackendDeletionAttestationV1 };

const DEMO_SUBJECT_PREFIX = 'infoshare-demo:';

let cachedBackendPublicKeyHex: string | null = null;

export function clearBackendPublicKeyCache(): void {
  cachedBackendPublicKeyHex = null;
}

function configuredReplicaHost(): string {
  const raw = import.meta.env.VITE_IC_HOST as string | undefined;
  return (raw?.trim() || 'http://127.0.0.1:4943').replace(/\/$/, '');
}

function loadDeployIdentityFromEnv(): string | undefined {
  const raw = (import.meta.env.VITE_MKTD03_SIGNING_IDENTITY_JSON as string | undefined)?.trim();
  return raw || undefined;
}

function resolveDeployIdentityJson(): string {
  const fromEnv = loadDeployIdentityFromEnv();
  if (fromEnv) return fromEnv;
  if (isLocalReplicaHost(configuredReplicaHost())) {
    return JSON.stringify(localDevIcIdentity);
  }
  throw new Error(
    'Deploy identity required (VITE_MKTD03_SIGNING_IDENTITY_JSON) for non-local IC replica.'
  );
}

function resolveAuditorHmacKeyHex(): string {
  const fromEnv = (import.meta.env.VITE_MKTD03_AUDITOR_HMAC_KEY_HEX as string | undefined)?.trim();
  return fromEnv || localDevAuditorKey.hex;
}

export function getIcHost(): string {
  const configured = configuredReplicaHost();
  const useDevProxy = Boolean(import.meta.env.DEV && isLocalReplicaHost(configured));
  return resolveAgentHost(configured, useDevProxy);
}

export function signingModeLabel(): string {
  const explicit = (import.meta.env.VITE_DEMO_SIGNING_MODE as string | undefined)
    ?.trim()
    .toLowerCase();
  if (explicit === 'internet_identity' || explicit === 'ii') return 'Internet Identity';
  if (explicit === 'local_key' || explicit === 'local' || explicit === 'ephemeral') {
    return 'localStorage key';
  }
  if (loadDeployIdentityFromEnv()) return 'deploy key (.env)';
  if (isLocalReplicaHost(configuredReplicaHost())) return 'shared dev key (local)';
  return 'deploy key';
}

export async function resolveTrustedBackendPublicKeyHex(): Promise<string> {
  const fromEnv = (import.meta.env.VITE_DEMO_BACKEND_PUBKEY_HEX as string | undefined)?.trim();
  if (fromEnv) return fromEnv;
  if (cachedBackendPublicKeyHex) return cachedBackendPublicKeyHex;
  const config = await fetchDemoApiConfig();
  cachedBackendPublicKeyHex = config.backendPublicKeyHex;
  return config.backendPublicKeyHex;
}

export async function connectDemoClient(canisterId: string): Promise<ZombieDeleteClient> {
  const configured = configuredReplicaHost();
  const useDevProxy = Boolean(import.meta.env.DEV && isLocalReplicaHost(configured));
  const explicit = (import.meta.env.VITE_DEMO_SIGNING_MODE as string | undefined)
    ?.trim()
    .toLowerCase();

  let mode: 'deploy_key' | 'internet_identity' | 'ephemeral' = 'deploy_key';
  if (explicit === 'internet_identity' || explicit === 'ii') {
    mode = 'internet_identity';
  } else if (explicit === 'local_key' || explicit === 'local' || explicit === 'ephemeral') {
    mode = 'ephemeral';
  } else if (loadDeployIdentityFromEnv() || isLocalReplicaHost(configured)) {
    mode = 'deploy_key';
  } else if ((import.meta.env.VITE_INTERNET_IDENTITY_URL as string | undefined)?.trim()) {
    mode = 'internet_identity';
  }

  return ZombieDeleteClient.connect({
    canisterId,
    icHost: configured,
    useDevProxy,
    auditorHmacKeyHex: resolveAuditorHmacKeyHex(),
    signing: {
      mode,
      icHost: configured,
      useDevProxy,
      deployIdentityJson: mode === 'deploy_key' ? resolveDeployIdentityJson() : undefined,
      internetIdentityUrl:
        (import.meta.env.VITE_INTERNET_IDENTITY_URL as string | undefined)?.trim() ||
        'https://identity.ic0.app/#authorize',
      ephemeralStorageKey: 'goneproof-mktd03-identity-v1',
    },
  });
}

export async function demoSubjectReference(recordId: string): Promise<Uint8Array> {
  return sha256(`${DEMO_SUBJECT_PREFIX}${recordId}`);
}

export async function issueDemoAttestedDeletionReceipt(
  client: ZombieDeleteClient,
  goneproof: SignedBackendDeletionAttestationV1,
  onProgress?: (p: IssuanceProgress) => void,
  audit?: DeletionAuditMetadata,
  trustedBackendPublicKeyHex?: string
): Promise<Receipt> {
  const trusted =
    trustedBackendPublicKeyHex?.trim() || (await resolveTrustedBackendPublicKeyHex());
  return client.issueAttestedDeletionReceipt({
    signedAttestation: goneproof,
    trustedBackendPublicKeyHex: trusted,
    audit,
    onProgress,
  });
}

export async function tryReissueDemoDeletion(
  client: ZombieDeleteClient,
  recordId: string
): Promise<string> {
  const transitionMaterial = await sha256(`transition:${recordId}`);
  return client.tryReissue({
    subjectReference: await demoSubjectReference(recordId),
    transitionMaterial,
  });
}

export function formatIssuanceAgentError(
  client: ZombieDeleteClient | null,
  error: unknown,
  canisterId?: string
): string {
  const raw = error instanceof Error ? error.message : String(error);
  const isControllerReject =
    raw.includes('begin_tree_receipt_issuance') &&
    (raw.includes('IC0406') ||
      raw.includes('reject code: 4') ||
      raw.includes('Canister rejected the message'));
  if (!isControllerReject) {
    return client?.formatAgentError(error) ?? raw;
  }

  const principal = client?.signerPrincipal ?? '—';
  const target = canisterId?.trim() || '<CANISTER_ID>';
  const mode = client?.signingModeLabel ?? signingModeLabel();
  return [
    'Issuance rejected: signer is not a canister controller (MKTd03 v3.2).',
    `Signer (${mode}): ${principal}`,
    'Expected: same principal as `dfx canister info` after deploy.',
    `Or: dfx canister update-settings ${target} --add-controller "${principal}"`,
  ].join('\n');
}

export function getActiveSignerPrincipalText(client?: ZombieDeleteClient | null): string {
  return client?.signerPrincipal ?? '—';
}

export function clearSignerSession(client?: ZombieDeleteClient | null): void {
  client?.disconnect();
}
