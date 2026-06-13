import type { DbEngine } from '../../shared/dbEngine.js';
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

export async function recordAbsent(engine: DbEngine, recordKey: string): Promise<boolean> {
  return useReal()
    ? realStore.recordAbsent(engine, recordKey)
    : jsonStore.recordAbsent(engine, recordKey);
}

export async function deleteRecord(engine: DbEngine, recordKey: string): Promise<boolean> {
  return useReal()
    ? realStore.deleteRecord(engine, recordKey)
    : jsonStore.deleteRecord(engine, recordKey);
}

export async function restoreRecord(engine: DbEngine, recordKey: string): Promise<boolean> {
  return useReal()
    ? realStore.restoreRecord(engine, recordKey)
    : jsonStore.restoreRecord(engine, recordKey);
}

export async function resetAll(): Promise<void> {
  if (useReal()) {
    await seedRealDatabases();
    return;
  }
  jsonStore.resetAll();
}

export function seedTotals() {
  return {
    mysql: jsonStore.JSON_SEED.mysql.filter((r) => r.recordKey).length,
    postgres: jsonStore.JSON_SEED.postgres.filter((r) => r.recordKey).length,
    mongo: jsonStore.JSON_SEED.mongo.filter((r) => r.recordKey).length,
  };
}
