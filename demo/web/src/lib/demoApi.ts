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
};

export type DeleteRecordResult = {
  ok: true;
  engine: DbEngine;
  recordKey: string;
  goneproof: import('@together-alone/zombiedelete').SignedBackendDeletionAttestationV1;
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

export async function resetDemoDatabases(): Promise<void> {
  await parseJson(await fetch(`${API_BASE}/api/reset`, { method: 'POST' }));
}
