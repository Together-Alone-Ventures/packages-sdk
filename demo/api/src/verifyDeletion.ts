import type { DbEngine } from '../../shared/dbEngine.js';
import type { VerifyDeletionContext } from '@together-alone/zombiedelete-server';
import {
  createDatabaseVerifier,
  createWiredDeletionVerifier,
  type DatabaseVerifier,
} from '@together-alone/zombiedelete-server';
import { recordAbsent } from './store.js';

/** Demo stand-in for a real DB pool handle (production: pass `pg.Pool`, `mysql2` pool, Mongo client). */
export type DemoDatabaseConnection = {
  kind: 'demo-json-store';
  engine: DbEngine;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  execute: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown]>;
  findOne: (filter: Record<string, unknown>) => Promise<unknown | null>;
};

export function createDemoWiredConnection(engine: DbEngine, recordKey: string): DemoDatabaseConnection {
  const readAbsent = () => recordAbsent(engine, recordKey);
  return {
    kind: 'demo-json-store',
    engine,
    query: async () => ({ rows: readAbsent() ? [] : [{ found: 1 }] }),
    execute: async () => [readAbsent() ? [] : [{ found: 1 }], []],
    findOne: async () => (readAbsent() ? null : { _id: recordKey }),
  };
}

/** @deprecated Use createDemoWiredConnection(engine, recordKey) */
export function createDemoDatabaseConnection(engine: DbEngine): DemoDatabaseConnection {
  return createDemoWiredConnection(engine, '');
}

/**
 * Demo databaseVerifier — wires a connection object + read-after-delete check.
 * Production: replace with createPostgresVerifier({ connection: pool, resolveQuery: ... }).
 */
export function createDemoDatabaseVerifier(
  engine: DbEngine,
  recordKey: string,
  connection: DemoDatabaseConnection
): DatabaseVerifier<DemoDatabaseConnection> {
  return createDatabaseVerifier({
    engine,
    connection,
    verifyAbsent: async (_ctx: VerifyDeletionContext) => {
      const absent = recordAbsent(engine, recordKey);
      return {
        absent,
        checkedAtUnixMs: Date.now(),
        detail: absent ? undefined : 'row_still_present',
      };
    },
  });
}

/**
 * Production-shaped API using createWiredDeletionVerifier.
 * Demo substitutes JSON store via a pool-like connection wrapper.
 */
export function createDemoWiredVerifier(
  engine: DbEngine,
  recordKey: string,
  connection: DemoDatabaseConnection
): DatabaseVerifier<DemoDatabaseConnection> {
  return createWiredDeletionVerifier({
    connection: {
      query: async () => ({ rows: recordAbsent(engine, recordKey) ? [] : [{ found: 1 }] }),
      execute: async () => [recordAbsent(engine, recordKey) ? [] : [{ found: 1 }], []],
      findOne: async () => (recordAbsent(engine, recordKey) ? null : { _id: recordKey }),
    },
    databaseType: engine,
    tableOrCollection: `${engine}_records`,
    data: { keyField: 'record_key', keyValue: recordKey },
  }) as DatabaseVerifier<DemoDatabaseConnection>;
}

/**
 * PostgreSQL production pattern (documented for integrators):
 * ```ts
 * createPostgresVerifier({
 *   connection: pool,
 *   resolveQuery: (ctx) => ({
 *     sql: 'SELECT 1 FROM conference_pii WHERE record_key = $1',
 *     params: [recordKeyFrom(ctx)],
 *   }),
 * });
 * ```
 */
export async function verifyPostgresDeletionAbsent(params: {
  recordKey: string;
  sourceLocator?: string;
}): Promise<{ absent: boolean; detail?: string; checkedAtUnixMs: number }> {
  const absent = recordAbsent('postgres', params.recordKey);
  return {
    absent,
    checkedAtUnixMs: Date.now(),
    detail: absent
      ? undefined
      : `postgres_row_still_visible:${params.sourceLocator ?? params.recordKey}`,
  };
}
