import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbEngine } from '../../shared/dbEngine.js';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import { deletionTargetForRow } from '../../shared/deletionSubject.js';
import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import { getCurrentSeed } from './scenarioState.js';

const apiDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(apiDir, '..', 'data');

type Row = MysqlPiiRow | PostgresRow | MongoDocument;

export function getJsonSeed() {
  return getCurrentSeed();
}

function fileFor(engine: DbEngine): string {
  return path.join(dataDir, `${engine}.json`);
}

function readEngine<T>(engine: DbEngine): T[] {
  const file = fileFor(engine);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(getJsonSeed()[engine], null, 2));
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T[];
}

function writeEngine(engine: DbEngine, rows: unknown[]): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(fileFor(engine), JSON.stringify(rows, null, 2));
}

function rowMatchesTarget(engine: DbEngine, row: Row, target: DeletionTarget): boolean {
  const rowTarget = deletionTargetForRow(engine, row);
  return rowTarget?.handle === target.handle;
}

export function listRecords(engine: DbEngine): unknown[] {
  return readEngine(engine);
}

export function recordAbsentForTarget(engine: DbEngine, target: DeletionTarget): boolean {
  const rows = readEngine<Row>(engine);
  return !rows.some((row) => rowMatchesTarget(engine, row, target));
}

export function deleteRecordByHandle(engine: DbEngine, handle: string): boolean {
  const rows = readEngine<Row>(engine);
  const next = rows.filter((row) => deletionTargetForRow(engine, row)?.handle !== handle);
  if (next.length === rows.length) return false;
  writeEngine(engine, next);
  return true;
}

export function restoreRecordByHandle(engine: DbEngine, handle: string): boolean {
  const seed = getJsonSeed()[engine] as Row[];
  const row = seed.find((entry) => deletionTargetForRow(engine, entry)?.handle === handle);
  if (!row) return false;
  const rows = readEngine<Row>(engine);
  if (rows.some((entry) => deletionTargetForRow(engine, entry)?.handle === handle)) return false;
  writeEngine(engine, [...rows, row]);
  return true;
}

export function insertRecord(engine: DbEngine, row: unknown): boolean {
  const target = deletionTargetForRow(engine, row as Row);
  if (!target) return false;
  const rows = readEngine<Row>(engine);
  if (rows.some((entry) => deletionTargetForRow(engine, entry)?.handle === target.handle)) {
    return false;
  }
  writeEngine(engine, [...rows, row]);
  return true;
}

export function resetAll(): void {
  const seed = getJsonSeed();
  writeEngine('mysql', seed.mysql);
  writeEngine('postgres', seed.postgres);
  writeEngine('mongo', seed.mongo);
}
