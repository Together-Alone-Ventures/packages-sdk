import { AuthClient } from '@dfinity/auth-client';
import { HttpAgent, type Identity } from '@dfinity/agent';
import { Ed25519KeyIdentity } from '@dfinity/identity';

export type SigningMode = 'deploy_key' | 'internet_identity' | 'ephemeral';

export type SigningOptions = {
  icHost: string;
  /** When true and host is local, browser apps use `window.location.origin` (Vite IC proxy). */
  useDevProxy?: boolean;
  mode?: SigningMode;
  deployIdentityJson?: string | number[][];
  internetIdentityUrl?: string;
  ephemeralStorageKey?: string;
};

export type SigningSession = {
  mode: SigningMode;
  modeLabel: string;
  principalText: string;
  createAgent: () => Promise<HttpAgent>;
  clear: () => void;
};

export function isLocalReplicaHost(host: string): boolean {
  try {
    const u = new URL(host.includes('://') ? host : `http://${host}`);
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return (
      h === '127.0.0.1' ||
      h === 'localhost' ||
      h === '::1' ||
      u.hostname.toLowerCase() === '[::1]' ||
      u.hostname.toLowerCase().endsWith('.localhost')
    );
  } catch {
    return false;
  }
}

export function resolveAgentHost(icHost: string, useDevProxy = false): string {
  const configured = icHost.trim().replace(/\/$/, '') || 'http://127.0.0.1:4943';
  if (useDevProxy && isLocalReplicaHost(configured) && typeof window !== 'undefined') {
    return window.location.origin;
  }
  try {
    const u = new URL(configured.includes('://') ? configured : `http://${configured}`);
    if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
    return u.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}

function parseDeployIdentity(json: string | number[][]): Ed25519KeyIdentity {
  if (typeof json === 'string') {
    return Ed25519KeyIdentity.fromJSON(json);
  }
  return Ed25519KeyIdentity.fromParsedJson([
    json[0] as unknown as string,
    json[1] as unknown as string,
  ]);
}

function hostnameLooksLikePrincipal(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.localhost$/, '');
  return host.split('-').length >= 10;
}

function assertValidInternetIdentityUrl(url: string): void {
  const u = new URL(url.replace(/#.*$/, ''));
  if (hostnameLooksLikePrincipal(u.hostname)) {
    throw new Error(
      'Internet Identity URL looks like a principal, not an II canister. Use identity.ic0.app or a local II canister id.'
    );
  }
}

function usesDefaultMainnetInternetIdentity(url: string | undefined): boolean {
  if (!url?.trim()) return true;
  try {
    const u = new URL(url.replace(/#.*$/, ''));
    const h = u.hostname.toLowerCase();
    return h === 'identity.ic0.app' || h === 'identity.internetcomputer.org';
  } catch {
    return false;
  }
}

function loadOrCreateEphemeralKey(storageKey: string): Ed25519KeyIdentity {
  if (typeof localStorage !== 'undefined') {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as number[][];
        if (Array.isArray(parsed) && parsed.length === 2) {
          return Ed25519KeyIdentity.fromParsedJson([
            parsed[0] as unknown as string,
            parsed[1] as unknown as string,
          ]);
        }
      } catch {
        /* regenerate */
      }
    }
  }
  const identity = Ed25519KeyIdentity.generate();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey, JSON.stringify(identity.toJSON()));
  }
  return identity;
}

async function loginInternetIdentity(identityProviderUrl: string, icHost: string): Promise<Identity> {
  assertValidInternetIdentityUrl(identityProviderUrl);
  if (isLocalReplicaHost(icHost) && usesDefaultMainnetInternetIdentity(identityProviderUrl)) {
    throw new Error(
      'Local replica: use deploy_key / local dev identity instead of mainnet Internet Identity.'
    );
  }
  const authClient = await AuthClient.create();
  if (!(await authClient.isAuthenticated())) {
    await new Promise<void>((resolve, reject) => {
      authClient.login({
        identityProvider: new URL(identityProviderUrl),
        onSuccess: () => resolve(),
        onError: (err) => reject(err ?? new Error('internet_identity_login_failed')),
      });
    });
  }
  return authClient.getIdentity();
}

export function createSigningSession(options: SigningOptions): SigningSession {
  let cachedIdentity: Identity | null = null;
  let cachedPrincipalText: string | null = null;

  const mode: SigningMode = options.mode ?? 'deploy_key';
  const agentHost = resolveAgentHost(options.icHost, options.useDevProxy ?? false);
  const replicaHost = options.icHost.trim().replace(/\/$/, '') || 'http://127.0.0.1:4943';

  const modeLabel = (() => {
    switch (mode) {
      case 'deploy_key':
        return options.deployIdentityJson ? 'deploy key (imported)' : 'deploy key (local dev)';
      case 'internet_identity':
        return 'Internet Identity';
      default:
        return 'ephemeral key (localStorage)';
    }
  })();

  if (mode === 'deploy_key' && options.deployIdentityJson) {
    cachedIdentity = parseDeployIdentity(options.deployIdentityJson);
    cachedPrincipalText = cachedIdentity.getPrincipal().toText();
  }

  async function resolveIdentity(): Promise<Identity> {
    if (cachedIdentity) return cachedIdentity;
    switch (mode) {
      case 'deploy_key': {
        if (!options.deployIdentityJson) {
          throw new Error('deployIdentityJson is required for deploy_key signing mode.');
        }
        cachedIdentity = parseDeployIdentity(options.deployIdentityJson);
        break;
      }
      case 'internet_identity':
        cachedIdentity = await loginInternetIdentity(
          options.internetIdentityUrl ?? 'https://identity.ic0.app/#authorize',
          replicaHost
        );
        break;
      default:
        cachedIdentity = loadOrCreateEphemeralKey(
          options.ephemeralStorageKey ?? 'zombiedelete-ephemeral-identity-v1'
        );
    }
    cachedPrincipalText = cachedIdentity.getPrincipal().toText();
    return cachedIdentity;
  }

  return {
    mode,
    get modeLabel() {
      return modeLabel;
    },
    get principalText() {
      return cachedPrincipalText ?? '—';
    },
    async createAgent() {
      const identity = await resolveIdentity();
      const agent = await HttpAgent.create({
        host: agentHost,
        identity,
        shouldSyncTime: !isLocalReplicaHost(replicaHost),
      });
      if (isLocalReplicaHost(replicaHost)) {
        await agent.fetchRootKey();
      }
      return agent;
    },
    clear() {
      cachedIdentity = null;
      cachedPrincipalText = null;
    },
  };
}

export function formatControllerRejectError(
  error: unknown,
  canisterId: string | undefined,
  principalText: string,
  modeLabel: string
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
    `Signer (${modeLabel}): ${principalText}`,
    'Expected: same principal as `dfx canister info` after deploy.',
    `Or: dfx canister update-settings ${target} --add-controller "${principalText}"`,
  ].join('\n');
}
