import type { DbEngine } from '@demo-shared/dbEngine';
import type { ScenarioId } from '@demo-shared/demoScenarios';
import type {
  MongoDocument,
  MysqlPiiRow,
  PostgresRow,
} from '../data/demoDatabases';

const API_BASE =
  (import.meta.env.VITE_DEMO_API_URL as string | undefined)?.trim() || '/demo-api';

export type DemoScenarioMeta = {
  id: ScenarioId;
  label: string;
  eyebrow: string;
  subtitle: string;
};

export type DemoApiConfig = {
  backendPublicKeyHex: string;
  subjectPrefix: string;
  storageMode?: 'json' | 'real';
  mktd03CanisterId?: string | null;
  icHost?: string;
  skipMktd03Preflight?: boolean;
  scenarioId?: ScenarioId;
  scenarios?: DemoScenarioMeta[];
  tables?: Partial<Record<DbEngine, string>>;
};

export type DeleteRecordResult = {
  ok: true;
  engine: DbEngine;
  recordKey: string;
  offsign: import('@together-alone/zombiedelete-server').SignedBackendDeletionAttestationV1;
  receipt?: import('@together-alone/zombiedelete-core').Receipt;
  /** @deprecated use `offsign` */
  goneproof?: import('@together-alone/zombiedelete-server').SignedBackendDeletionAttestationV1;
  backendPublicKeyHex: string;
};

export type Mktd03AllowanceSnapshot = {
  remaining: number;
  reserved: number;
  available: number;
  commercialStatus: string;
  canEmit: boolean;
  source?: 'on_chain' | 'demo_estimate';
  used?: number;
  interfaceVersion?: string;
};

export type Mktd03AllowanceUnavailable = {
  kind: 'unavailable';
  error: string;
  interfaceVersion?: string;
  requiredInterface?: string;
  message: string;
};

export type Mktd03AllowanceResult = Mktd03AllowanceSnapshot | Mktd03AllowanceUnavailable;

export function isAllowanceUnavailable(
  value: Mktd03AllowanceResult | null
): value is Mktd03AllowanceUnavailable {
  return value != null && 'kind' in value && value.kind === 'unavailable';
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let body: { error?: string } | null = null;
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      // plain-text error body
    }
    if (body?.error === 'not_found') {
      throw new Error(
        'This row is no longer in the demo database (already destroyed). Pick an Active row or reset: curl -X POST http://127.0.0.1:8787/api/reset'
      );
    }
    if (body?.error) {
      throw new Error(`Demo API: ${body.error}`);
    }
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export async function fetchDemoApiConfig(): Promise<DemoApiConfig> {
  const data = await parseJson<{ ok: true } & DemoApiConfig>(
    await fetch(`${API_BASE}/api/config`)
  );
  return {
    backendPublicKeyHex: data.backendPublicKeyHex,
    subjectPrefix: data.subjectPrefix,
    storageMode: data.storageMode,
    mktd03CanisterId: data.mktd03CanisterId,
    icHost: data.icHost,
    skipMktd03Preflight: data.skipMktd03Preflight,
    scenarioId: data.scenarioId,
    scenarios: data.scenarios,
    tables: data.tables,
  };
}

export async function fetchMktd03Allowance(
  canisterId?: string
): Promise<Mktd03AllowanceResult | null> {
  const qs = canisterId?.trim() ? `?canisterId=${encodeURIComponent(canisterId.trim())}` : '';
  const res = await fetch(`${API_BASE}/api/mktd03/allowance${qs}`);
  const body = (await res.json()) as {
    ok?: boolean;
    error?: string;
    interfaceVersion?: string;
    requiredInterface?: string;
    message?: string;
    allowance?: {
      remaining: string;
      reserved: string;
      available: string;
      commercialStatus: string;
      canEmit: boolean;
      source?: 'on_chain' | 'demo_estimate';
      used?: string;
      interfaceVersion?: string;
    };
  };
  if (body.error === 'commercial_interface_missing') {
    return {
      kind: 'unavailable',
      error: body.error,
      interfaceVersion: body.interfaceVersion,
      requiredInterface: body.requiredInterface,
      message: body.message ?? 'get_allowance_status unavailable on this canister',
    };
  }
  if (!res.ok || !body.ok || !body.allowance) return null;
  const a = body.allowance;
  return {
    remaining: Number(a.remaining),
    reserved: Number(a.reserved),
    available: Number(a.available),
    commercialStatus: a.commercialStatus,
    canEmit: a.canEmit,
    source: a.source,
    used: a.used != null ? Number(a.used) : undefined,
    interfaceVersion: a.interfaceVersion,
  };
}

export async function fetchEngineRecords(engine: DbEngine): Promise<{
  mysql: MysqlPiiRow[];
  postgres: PostgresRow[];
  mongo: MongoDocument[];
}> {
  const data = await parseJson<{ ok: true; records: unknown[] }>(
    await fetch(`${API_BASE}/api/${engine}/records`)
  );
  if (engine === 'mysql') return { mysql: data.records as MysqlPiiRow[], postgres: [], mongo: [] };
  if (engine === 'postgres') {
    return { postgres: data.records as PostgresRow[], mysql: [], mongo: [] };
  }
  return { mongo: data.records as MongoDocument[], mysql: [], postgres: [] };
}

export async function fetchAllEngineSnapshots(): Promise<{
  mysql: MysqlPiiRow[];
  postgres: PostgresRow[];
  mongo: MongoDocument[];
}> {
  const [mysql, postgres, mongo] = await Promise.all([
    fetchEngineRecords('mysql'),
    fetchEngineRecords('postgres'),
    fetchEngineRecords('mongo'),
  ]);
  return {
    mysql: mysql.mysql,
    postgres: postgres.postgres,
    mongo: mongo.mongo,
  };
}

export async function deleteRecordViaApi(
  engine: DbEngine,
  recordKey: string
): Promise<DeleteRecordResult> {
  return parseJson<DeleteRecordResult>(
    await fetch(`${API_BASE}/api/${engine}/records/${encodeURIComponent(recordKey)}`, {
      method: 'DELETE',
    })
  );
}

export type DeclaredDeletionCheckResult = {
  ok: boolean;
  absent: boolean;
  attestationVerified: boolean;
  detail?: string;
};

export async function checkDeclaredDeletionViaApi(params: {
  engine: DbEngine;
  recordKey: string;
  signedAttestation: DeleteRecordResult['offsign'];
  receipt?: import('@together-alone/zombiedelete-core').Receipt;
}): Promise<DeclaredDeletionCheckResult> {
  const data = await parseJson<{ ok: true; check: DeclaredDeletionCheckResult }>(
    await fetch(`${API_BASE}/api/check-declared-deletion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        engine: params.engine,
        recordKey: params.recordKey,
        signedAttestation: params.signedAttestation,
        receipt: params.receipt,
      }),
    })
  );
  return data.check;
}

export async function restoreRecordViaApi(
  engine: DbEngine,
  recordKey: string
): Promise<{ ok: true } | { ok: false; error: string; message?: string }> {
  const res = await fetch(
    `${API_BASE}/api/${engine}/records/${encodeURIComponent(recordKey)}/restore`,
    { method: 'POST' }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    return { ok: false, error: body.error ?? 'restore_failed', message: body.message };
  }
  return parseJson(await res);
}

export async function addRecordViaApi(
  engine: DbEngine,
  body: Record<string, string>
): Promise<{ ok: true; recordKey: string; tableOrCollection: string; assignedId?: number | string }> {
  const payload: Record<string, unknown> = { ...body };
  if (engine === 'mongo' && body.docJson) {
    payload.docJson = body.docJson;
  }
  const res = await fetch(`${API_BASE}/api/${engine}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    recordKey?: string;
    tableOrCollection?: string;
    assignedId?: number | string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.message ?? data.error ?? res.statusText);
  }
  return {
    ok: true,
    recordKey: data.recordKey ?? body.recordKey ?? '',
    tableOrCollection: data.tableOrCollection ?? '',
    assignedId: data.assignedId,
  };
}

export async function resetDemoDatabases(): Promise<void> {
  await parseJson(await fetch(`${API_BASE}/api/reset`, { method: 'POST' }));
}

export async function switchDemoScenario(scenarioId: ScenarioId): Promise<ScenarioId> {
  const data = await parseJson<{ ok: true; scenarioId: ScenarioId }>(
    await fetch(`${API_BASE}/api/scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    })
  );
  return data.scenarioId;
}

export async function downloadDeletionCertificatePdf(params: {
  engine: DbEngine;
  recordKey: string;
  receipt: import('@together-alone/zombiedelete-core').Receipt;
  /** Optional — API caches attestation after DELETE offsign. */
  signedAttestation?: import('@together-alone/zombiedelete-server').SignedBackendDeletionAttestationV1;
}): Promise<Blob> {
  const res = await fetch(
    `${API_BASE}/api/${params.engine}/records/${encodeURIComponent(params.recordKey)}/deletion-certificate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt: params.receipt,
        ...(params.signedAttestation ? { signedAttestation: params.signedAttestation } : {}),
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const body = JSON.parse(text) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // plain text
    }
    throw new Error(message);
  }
  return res.blob();
}
