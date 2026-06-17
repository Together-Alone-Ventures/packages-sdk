import type { WiredDeletionData } from '@together-alone/zombiedelete-core';
import type { DbEngine } from '../../shared/dbEngine.js';
import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import {
  buildDeletionHandleFromParts,
  deletionKeyConfig,
  deletionTargetForRow,
  type DeletionTarget,
} from '../../shared/deletionSubject.js';
import { listRecords } from './store.js';

type Row = MysqlPiiRow | PostgresRow | MongoDocument;

export async function findRowByDeletionHandle(
  engine: DbEngine,
  handle: string
): Promise<Row | null> {
  const rows = (await listRecords(engine)) as Row[];
  for (const row of rows) {
    const target = deletionTargetForRow(engine, row);
    if (target?.handle === handle) return row;
  }
  return null;
}

export async function resolveDeletionTarget(
  engine: DbEngine,
  handle: string,
  keyFieldOverride?: string
): Promise<DeletionTarget | null> {
  const row = await findRowByDeletionHandle(engine, handle);
  if (row) {
    return deletionTargetForRow(engine, row, keyFieldOverride);
  }
  return null;
}

export function deletionTargetFromInsert(
  engine: DbEngine,
  keyField: string,
  rawValue: string
): DeletionTarget {
  const config = deletionKeyConfig(engine, keyField);
  const tableOrCollection =
    engine === 'mysql' ? 'customer_pii' : engine === 'postgres' ? 'customer_contacts' : 'demo_documents';
  const keyValue = config.normalize(rawValue);
  return {
    engine,
    tableOrCollection,
    keyField: config.keyField,
    keyValue,
    handle: buildDeletionHandleFromParts(engine, keyField, rawValue),
  };
}

export function wiredDataForDeletionTarget(target: DeletionTarget): WiredDeletionData {
  if (target.engine === 'mongo') {
    const field =
      target.keyField === 'email'
        ? 'doc.email'
        : target.keyField === 'title'
          ? 'doc.title'
          : `doc.${target.keyField}`;
    return { [field]: target.keyValue };
  }
  return { keyField: target.keyField, keyValue: target.keyValue };
}

export function sourceLocatorKeyForTarget(target: DeletionTarget): string {
  const encoded = target.handle.split('/').slice(3).join('/');
  return `${target.keyField}/${encoded}`;
}
