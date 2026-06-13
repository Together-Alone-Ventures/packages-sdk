import type { DbEngine } from '@demo-shared/dbEngine';
import type {
  MongoDocument,
  MysqlPiiRow,
  PostgresRow,
} from '../data/demoDatabases';

const API_BASE =
  (import.meta.env.VITE_DEMO_API_URL as string | undefined)?.trim() || '/demo-api';

export type DemoApiConfig = {
  backendPublicKeyHex: string;
  subjectPrefix: string;
  storageMode?: 'json' | 'real';
  mktd03CanisterId?: string | null;
  icHost?: string;
  skipMktd03Preflight?: boolean;
};

export type DeleteRecordResult = {
  ok: true;
  engine: DbEngine;
  recordKey: string;
  offsign: import('@together-alone/zombiedelete-server').SignedBackendDeletionAttestationV1;
  /** @deprecated use `offsign` */
  goneproof?: import('@together-alone/zombiedelete-server').SignedBackendDeletionAttestationV1;
  backendPublicKeyHex: string;
};

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
        'Cette ligne n’existe plus dans la BDD demo (déjà effacée). Choisis une ligne « Active » ou réinitialise : curl -X POST http://127.0.0.1:8787/api/reset'
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

export async function resetDemoDatabases(): Promise<void> {
  await parseJson(await fetch(`${API_BASE}/api/reset`, { method: 'POST' }));
}

export async function downloadDeletionCertificatePdf(params: {
  engine: DbEngine;
  recordKey: string;
  receipt: import('@together-alone/zombiedelete-core').Receipt;
  /** Optionnel : l’API garde l’attestation en cache après prove-deletion. */
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
