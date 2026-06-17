import type { DbEngine } from '../../shared/dbEngine.js';
import type { WiredDeletionData } from '@together-alone/zombiedelete-core';
import {
  createWiredDeletionVerifier,
  type DatabaseVerifier,
} from '@together-alone/zombiedelete-server/internal';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import { demoStorageMode, MONGO_COLLECTION, MYSQL_TABLE, POSTGRES_TABLE } from './config.js';
import { getMongoCollection, getMysqlPool, getPostgresPool } from './db/pools.js';
import { recordAbsentForTarget } from './store.js';
import { wiredDataForDeletionTarget } from './deletionResolve.js';

export type WiredDeletionTarget = {
  connection: unknown;
  databaseType: DbEngine;
  tableOrCollection: string;
  data: WiredDeletionData;
};

export function wiredDeletionTargetFromDeletionTarget(
  target: DeletionTarget
): WiredDeletionTarget {
  if (demoStorageMode() === 'real') {
    return realWiredTarget(target);
  }
  return jsonWiredTarget(target);
}

function jsonWiredTarget(target: DeletionTarget): WiredDeletionTarget {
  const data = wiredDataForDeletionTarget(target);
  const readAbsent = () => recordAbsentForTarget(target.engine, target);
  const connection = {
    kind: 'demo-json-store' as const,
    engine: target.engine,
    query: async () => ({ rows: (await readAbsent()) ? [] : [{ found: 1 }] }),
    execute: async () => [(await readAbsent()) ? [] : [{ found: 1 }], []],
    findOne: async () => ((await readAbsent()) ? null : { _id: target.handle }),
  };
  return {
    connection,
    databaseType: target.engine,
    tableOrCollection: tableForEngine(target.engine),
    data,
  };
}

function realWiredTarget(target: DeletionTarget): WiredDeletionTarget {
  const data = wiredDataForDeletionTarget(target);
  if (target.engine === 'mysql') {
    return {
      connection: getMysqlPool(),
      databaseType: 'mysql',
      tableOrCollection: MYSQL_TABLE,
      data,
    };
  }
  if (target.engine === 'postgres') {
    return {
      connection: getPostgresPool(),
      databaseType: 'postgres',
      tableOrCollection: POSTGRES_TABLE,
      data,
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
    data,
  };
}

function tableForEngine(engine: DbEngine): string {
  if (engine === 'mysql') return MYSQL_TABLE;
  if (engine === 'postgres') return POSTGRES_TABLE;
  return MONGO_COLLECTION;
}

export function createDemoDatabaseVerifier(target: DeletionTarget): DatabaseVerifier {
  const wired = wiredDeletionTargetFromDeletionTarget(target);
  return createWiredDeletionVerifier({
    connection: wired.connection,
    databaseType: wired.databaseType,
    tableOrCollection: wired.tableOrCollection,
    data: wired.data,
  });
}
