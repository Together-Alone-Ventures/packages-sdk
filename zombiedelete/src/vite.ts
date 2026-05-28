import { isLocalReplicaHost, type SigningMode, type SigningOptions } from './signing.js';

function envString(key: string): string | undefined {
  const meta = (import.meta as { env?: Record<string, string | undefined> }).env;
  const value = meta?.[key] ?? (typeof process !== 'undefined' ? process.env[key] : undefined);
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function envBool(key: string): boolean {
  return envString(key) === 'true';
}

export function defaultCanisterIdFromViteEnv(): string | undefined {
  return envString('VITE_MKTD03_CANISTER_ID');
}

export function signingOptionsFromViteEnv(
  deployIdentityJson?: string | number[][]
): SigningOptions {
  const icHost = envString('VITE_IC_HOST') ?? 'http://127.0.0.1:4943';
  const useDevProxy =
    envBool('VITE_IC_USE_DEV_PROXY') ||
    Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

  const explicit = envString('VITE_DEMO_SIGNING_MODE')?.toLowerCase();
  let mode: SigningMode = 'deploy_key';
  if (explicit === 'internet_identity' || explicit === 'ii') {
    mode = 'internet_identity';
  } else if (explicit === 'local_key' || explicit === 'local' || explicit === 'ephemeral') {
    mode = 'ephemeral';
  } else if (explicit === 'deploy_key' || explicit === 'deploy' || explicit === 'import') {
    mode = 'deploy_key';
  } else if (envString('VITE_MKTD03_SIGNING_IDENTITY_JSON')) {
    mode = 'deploy_key';
  } else if (isLocalReplicaHost(icHost)) {
    mode = 'deploy_key';
  } else if (envString('VITE_INTERNET_IDENTITY_URL')) {
    mode = 'internet_identity';
  }

  const fromEnvJson = envString('VITE_MKTD03_SIGNING_IDENTITY_JSON');
  let parsedDeploy: string | number[][] | undefined = deployIdentityJson;
  if (fromEnvJson) {
    parsedDeploy = fromEnvJson;
  }

  return {
    mode,
    icHost,
    useDevProxy,
    deployIdentityJson: mode === 'deploy_key' ? parsedDeploy : undefined,
    internetIdentityUrl: envString('VITE_INTERNET_IDENTITY_URL'),
    ephemeralStorageKey: envString('VITE_EPHEMERAL_IDENTITY_STORAGE_KEY'),
  };
}

export function auditorHmacKeyHexFromViteEnv(): string | undefined {
  return envString('VITE_MKTD03_AUDITOR_HMAC_KEY_HEX') ?? envString('VITE_AUDITOR_HMAC_KEY_HEX');
}

export type ConnectFromViteEnvOptions = {
  canisterId?: string;
  signing?: SigningOptions;
  auditorHmacKeyHex?: string;
  deployIdentityJson?: string | number[][];
};

export async function connectFromViteEnv(
  options: ConnectFromViteEnvOptions = {}
): Promise<import('./client.js').ZombieDeleteClient> {
  const { ZombieDeleteClient } = await import('./client.js');
  const canisterId = options.canisterId ?? defaultCanisterIdFromViteEnv();
  if (!canisterId) {
    throw new Error('VITE_MKTD03_CANISTER_ID is not set.');
  }
  const signing = options.signing ?? signingOptionsFromViteEnv(options.deployIdentityJson);
  return ZombieDeleteClient.connect({
    canisterId,
    signing,
    useDevProxy: signing.useDevProxy,
    auditorHmacKeyHex: options.auditorHmacKeyHex ?? auditorHmacKeyHexFromViteEnv(),
  });
}
