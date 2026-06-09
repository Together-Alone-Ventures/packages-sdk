import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MONGO_DOCUMENTS,
  MYSQL_ROWS,
  POSTGRES_ROWS,
} from '../../shared/demoDatabases.js';
import type { DbEngine } from '../../shared/dbEngine.js';

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(apiDir, '..', 'data');

type EnginePayload = {
  mysql: typeof MYSQL_ROWS;
  postgres: typeof POSTGRES_ROWS;
  mongo: typeof MONGO_DOCUMENTS;
};

const SEED: EnginePayload = {
  mysql: MYSQL_ROWS,
  postgres: POSTGRES_ROWS,
  mongo: MONGO_DOCUMENTS,
};

function fileFor(engine: DbEngine): string {
  return path.join(dataDir, `${engine}.json`);
}

function readEngine<T>(engine: DbEngine): T[] {
  const file = fileFor(engine);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(SEED[engine], null, 2));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T[];
}

function writeEngine(engine: DbEngine, rows: unknown[]): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(fileFor(engine), JSON.stringify(rows, null, 2));
}

export function listRecords(engine: DbEngine): unknown[] {
  return readEngine(engine);
}

export function recordAbsent(engine: DbEngine, recordKey: string): boolean {
  const rows = readEngine<{ recordKey?: string }>(engine);
  return !rows.some((row) => row.recordKey === recordKey);
}

export function findRecord(engine: DbEngine, recordKey: string): unknown | null {
  const rows = readEngine<{ recordKey?: string }>(engine);
  return rows.find((row) => row.recordKey === recordKey) ?? null;
}

export function deleteRecord(engine: DbEngine, recordKey: string): boolean {
  const rows = readEngine<{ recordKey?: string }>(engine);
  const next = rows.filter((row) => row.recordKey !== recordKey);
  if (next.length === rows.length) return false;
  writeEngine(engine, next);
  return true;
}

export function restoreRecord(engine: DbEngine, recordKey: string): boolean {
  const seed = SEED[engine] as Array<{ recordKey?: string }>;
  const row = seed.find((entry) => entry.recordKey === recordKey);
  if (!row) return false;
  const rows = readEngine<{ recordKey?: string }>(engine);
  if (rows.some((entry) => entry.recordKey === recordKey)) return false;
  writeEngine(engine, [...rows, row]);
  return true;
}

export function resetAll(): void {
  writeEngine('mysql', SEED.mysql);
  writeEngine('postgres', SEED.postgres);
  writeEngine('mongo', SEED.mongo);
}

export function seedTotals(): Record<DbEngine, number> {
  return {
    mysql: SEED.mysql.filter((r) => r.recordKey).length,
    postgres: SEED.postgres.filter((r) => r.recordKey).length,
    mongo: SEED.mongo.filter((r) => r.recordKey).length,
  };
}
