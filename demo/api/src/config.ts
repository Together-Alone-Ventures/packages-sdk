export type DemoStorageMode = 'json' | 'real';

export function demoStorageMode(): DemoStorageMode {
  const raw = process.env.DEMO_STORAGE_MODE?.trim().toLowerCase();
  return raw === 'real' ? 'real' : 'json';
}

export function demoSkipMktd03Preflight(): boolean {
  const raw = process.env.DEMO_SKIP_MKTD03_PREFLIGHT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Canister MKTd03 cible — défini sur l’API, pas dans le navigateur. */
export function resolveMktd03CanisterId(override?: string | null): string | null {
  const fromRequest = override?.trim();
  if (fromRequest) return fromRequest;
  const fromEnv = process.env.MKTD03_CANISTER_ID?.trim();
  return fromEnv || null;
}

export function requireMktd03CanisterId(override?: string | null): string {
  const id = resolveMktd03CanisterId(override);
  if (!id) {
    throw new Error('mktd03_canister_id_not_configured');
  }
  return id;
}

export function postgresUrl(): string {
  return (
    process.env.DEMO_POSTGRES_URL?.trim() ||
    'postgresql://offsign:offsign@127.0.0.1:5433/meridian_prod'
  );
}

export function mysqlUrl(): string {
  return (
    process.env.DEMO_MYSQL_URL?.trim() ||
    'mysql://offsign:offsign@127.0.0.1:3307/meridian_platform'
  );
}

export function mongoUrl(): string {
  return process.env.DEMO_MONGO_URL?.trim() || 'mongodb://127.0.0.1:27018';
}

export const MYSQL_TABLE = 'customer_pii';
export const POSTGRES_TABLE = 'customer_contacts';
export const MONGO_COLLECTION = 'demo_documents';
