import type { DbEngine } from '../../shared/dbEngine.js';
import type { WiredDeletionData } from '@together-alone/zombiedelete-core';
import {
  createWiredDeletionVerifier,
  type DatabaseVerifier,
} from '@together-alone/zombiedelete-server/internal';
import { demoStorageMode, MONGO_COLLECTION, MYSQL_TABLE, POSTGRES_TABLE } from './config.js';
import { getMongoCollection, getMysqlPool, getPostgresPool } from './db/pools.js';
import { recordAbsent } from './store.js';

export type WiredDeletionTarget = {
  connection: unknown;
  databaseType: DbEngine;
  tableOrCollection: string;
  data: WiredDeletionData;
};

export function wiredDeletionTarget(engine: DbEngine, recordKey: string): WiredDeletionTarget {
  if (demoStorageMode() === 'real') {
    return realWiredTarget(engine, recordKey);
  }
  return jsonWiredTarget(engine, recordKey);
}

function jsonWiredTarget(engine: DbEngine, recordKey: string): WiredDeletionTarget {
  const readAbsent = () => recordAbsent(engine, recordKey);
  const connection = {
    kind: 'demo-json-store' as const,
    engine,
    query: async () => ({ rows: (await readAbsent()) ? [] : [{ found: 1 }] }),
    execute: async () => [(await readAbsent()) ? [] : [{ found: 1 }], []],
    findOne: async () => ((await readAbsent()) ? null : { _id: recordKey }),
  };
  return {
    connection,
    databaseType: engine,
    tableOrCollection: tableForEngine(engine),
    data: { keyField: 'record_key', keyValue: recordKey },
  };
}

function realWiredTarget(engine: DbEngine, recordKey: string): WiredDeletionTarget {
  if (engine === 'mysql') {
    return {
      connection: getMysqlPool(),
      databaseType: 'mysql',
      tableOrCollection: MYSQL_TABLE,
      data: { keyField: 'record_key', keyValue: recordKey },
    };
  }
  if (engine === 'postgres') {
    return {
      connection: getPostgresPool(),
      databaseType: 'postgres',
      tableOrCollection: POSTGRES_TABLE,
      data: { keyField: 'record_key', keyValue: recordKey },
    };
  }
  return {
    connection: {
      findOne: async (filter: Record<string, unknown>) => {
        const coll = await getMongoCollection();
        return coll.findOne(filter);
      },
    },
    databaseType: 'mongo',
    tableOrCollection: MONGO_COLLECTION,
    data: { record_key: recordKey },
  };
}

function tableForEngine(engine: DbEngine): string {
  if (engine === 'mysql') return MYSQL_TABLE;
  if (engine === 'postgres') return POSTGRES_TABLE;
  return MONGO_COLLECTION;
}

/** @deprecated Use wiredDeletionTarget */
export function createDemoWiredConnection(engine: DbEngine, recordKey: string) {
  const target = jsonWiredTarget(engine, recordKey);
  return {
    kind: 'demo-json-store' as const,
    engine,
    query: (target.connection as { query: () => Promise<{ rows: unknown[] }> }).query,
    execute: (target.connection as { execute: () => Promise<[unknown[], unknown]> }).execute,
    findOne: (target.connection as { findOne: () => Promise<unknown | null> }).findOne,
  };
}

export function createDemoDatabaseVerifier(
  engine: DbEngine,
  recordKey: string
): DatabaseVerifier {
  const target = wiredDeletionTarget(engine, recordKey);
  return createWiredDeletionVerifier({
    connection: target.connection,
    databaseType: target.databaseType,
    tableOrCollection: target.tableOrCollection,
    data: target.data,
  });
}
