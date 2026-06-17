import type { DbEngine } from '../../shared/dbEngine.js';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import { deletionTargetForRow } from '../../shared/deletionSubject.js';
import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import { demoStorageMode } from './config.js';
import * as jsonStore from './jsonStore.js';
import * as realStore from './realStore.js';
import { seedRealDatabases } from './db/seed.js';

const useReal = () => demoStorageMode() === 'real';

export function storageMode(): 'json' | 'real' {
  return demoStorageMode();
}

export async function listRecords(engine: DbEngine): Promise<unknown[]> {
  return useReal() ? realStore.listRecords(engine) : jsonStore.listRecords(engine);
}

export async function recordAbsentForTarget(
  engine: DbEngine,
  target: DeletionTarget
): Promise<boolean> {
  return useReal()
    ? realStore.recordAbsentForTarget(engine, target)
    : jsonStore.recordAbsentForTarget(engine, target);
}

export async function deleteRecordByHandle(
  engine: DbEngine,
  handle: string
): Promise<boolean> {
  return useReal()
    ? realStore.deleteRecordByHandle(engine, handle)
    : jsonStore.deleteRecordByHandle(engine, handle);
}

export async function restoreRecordByHandle(
  engine: DbEngine,
  handle: string
): Promise<boolean> {
  return useReal()
    ? realStore.restoreRecordByHandle(engine, handle)
    : jsonStore.restoreRecordByHandle(engine, handle);
}

export async function rowExistsForTarget(
  engine: DbEngine,
  target: DeletionTarget
): Promise<boolean> {
  const absent = await recordAbsentForTarget(engine, target);
  return !absent;
}

export async function resetAll(): Promise<void> {
  if (useReal()) {
    await seedRealDatabases();
    return;
  }
  jsonStore.resetAll();
}

export async function insertRecord(engine: DbEngine, row: unknown): Promise<boolean> {
  return useReal()
    ? realStore.insertRecord(engine, row)
    : jsonStore.insertRecord(engine, row);
}

export function seedTotals() {
  const seed = jsonStore.getJsonSeed();
  return {
    mysql: seed.mysql.length,
    postgres: seed.postgres.length,
    mongo: seed.mongo.length,
  };
}

export async function resolveTargetFromHandle(
  engine: DbEngine,
  handle: string
): Promise<DeletionTarget | null> {
  const rows = (await listRecords(engine)) as Array<MysqlPiiRow | PostgresRow | MongoDocument>;
  for (const row of rows) {
    const target = deletionTargetForRow(engine, row);
    if (target?.handle === handle) return target;
  }
  return null;
}
