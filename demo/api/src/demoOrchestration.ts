import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import {
  guardedInsert,
  offsignDelete,
  OffsignDeleteNotExecutedError,
  OffsignInsertBlockedError,
  queryMktd03Receipt,
} from '@together-alone/zombiedelete-server';
import type { DeletionAuditMetadata } from '@together-alone/zombiedelete-server';
import type { Ed25519KeyIdentity } from '@dfinity/identity';
import type { RestoreGuardResult } from '@together-alone/zombiedelete-core';
import type {
  MysqlInsertBody,
  MongoInsertBody,
  PostgresInsertBody,
} from './buildInsertRow.js';
import { demoStorageMode, requireMktd03CanisterId, resolveMktd03CanisterId } from './config.js';
import { getMongoCollection, getMysqlPool, getPostgresPool } from './db/pools.js';
import { MONGO_COLLECTION, MYSQL_TABLE, POSTGRES_TABLE } from './config.js';
import { wiredDataForDeletionTarget } from './deletionResolve.js';
import { deleteRecordByHandle, insertRecord, recordAbsentForTarget } from './store.js';

function resolveMktd03IcHost(): string {
  return (process.env.MKTD03_IC_HOST?.trim() || 'https://icp-api.io').replace(/\/$/, '');
}

function tableForEngine(engine: DbEngine): string {
  if (engine === 'mysql') return MYSQL_TABLE;
  if (engine === 'postgres') return POSTGRES_TABLE;
  return MONGO_COLLECTION;
}

export async function mutationConnectionForEngine(engine: DbEngine): Promise<unknown> {
  if (engine === 'mysql') return getMysqlPool();
  if (engine === 'postgres') return getPostgresPool();
  const coll = await getMongoCollection();
  return {
    findOne: (filter: Record<string, unknown>) => coll.findOne(filter),
    deleteOne: (filter: Record<string, unknown>) => coll.deleteOne(filter),
    insertOne: (document: Record<string, unknown>) => coll.insertOne(document),
  };
}

function jsonMutationConnection(
  engine: DbEngine,
  target: DeletionTarget,
  pendingRow?: MysqlPiiRow | PostgresRow | MongoDocument
) {
  const readAbsent = () => recordAbsentForTarget(engine, target);
  return {
    kind: 'demo-json-store' as const,
    engine,
    query: async (sql: string) => {
      if (sql.startsWith('DELETE FROM')) {
        const deleted = await deleteRecordByHandle(engine, target.handle);
        return { rows: [], rowCount: deleted ? 1 : 0 };
      }
      if (sql.startsWith('INSERT INTO')) {
        if (!pendingRow) throw new Error('missing_pending_row');
        const inserted = await insertRecord(engine, pendingRow);
        return { rows: [], rowCount: inserted ? 1 : 0 };
      }
      if (sql.startsWith('SELECT')) {
        return { rows: (await readAbsent()) ? [] : [{ found: 1 }] };
      }
      throw new Error(`unsupported_json_query:${sql.slice(0, 32)}`);
    },
    execute: async (sql: string) => {
      if (sql.startsWith('DELETE FROM')) {
        const deleted = await deleteRecordByHandle(engine, target.handle);
        return [{ affectedRows: deleted ? 1 : 0 }, []];
      }
      if (sql.startsWith('INSERT INTO')) {
        if (!pendingRow) throw new Error('missing_pending_row');
        const inserted = await insertRecord(engine, pendingRow);
        return [{ affectedRows: inserted ? 1 : 0 }, []];
      }
      if (sql.startsWith('SELECT')) {
        return [(await readAbsent()) ? [] : [{ found: 1 }], []];
      }
      throw new Error(`unsupported_json_query:${sql.slice(0, 32)}`);
    },
    findOne: async () => ((await readAbsent()) ? null : { _id: target.handle }),
    deleteOne: async () => {
      const deleted = await deleteRecordByHandle(engine, target.handle);
      return { deletedCount: deleted ? 1 : 0 };
    },
    insertOne: async () => {
      if (!pendingRow) throw new Error('missing_pending_row');
      const inserted = await insertRecord(engine, pendingRow);
      if (!inserted) throw new Error('json_insert_failed');
      return { acknowledged: true };
    },
  };
}

export function restoreGuardClient(canisterIdOverride?: string) {
  const canisterId = resolveMktd03CanisterId(canisterIdOverride);
  return {
    getReceipt: async (subjectReference: Uint8Array) => {
      if (!canisterId) return { kind: 'not_found' as const };
      return queryMktd03Receipt(requireMktd03CanisterId(canisterId), resolveMktd03IcHost(), subjectReference);
    },
  };
}

export type OrchestratedDeleteParams = {
  engine: DbEngine;
  target: DeletionTarget;
  identity: Ed25519KeyIdentity;
  subjectReference: Uint8Array;
  deletionEventId: string;
  sourceSystem: string;
  sourceLocator: string;
  canisterId: string;
  icHost: string;
  controllerIdentity: Ed25519KeyIdentity;
  trustedBackendPublicKeyHex: string;
  skipPreflight?: boolean;
  audit?: DeletionAuditMetadata;
};

export async function orchestratedDelete(params: OrchestratedDeleteParams) {
  const { engine, target } = params;
  const connection =
    demoStorageMode() === 'real'
      ? await mutationConnectionForEngine(engine)
      : jsonMutationConnection(engine, target);
  const data = wiredDataForDeletionTarget(target);

  return offsignDelete({
    identity: params.identity,
    subjectReference: params.subjectReference,
    deletionEventId: params.deletionEventId,
    sourceSystem: params.sourceSystem,
    sourceLocator: params.sourceLocator,
    dbEngine: engine,
    connection,
    databaseType: engine,
    tableOrCollection: tableForEngine(engine),
    data,
    mktd03: {
      canisterId: params.canisterId,
      icHost: params.icHost,
      controllerIdentity: params.controllerIdentity,
      trustedBackendPublicKeyHex: params.trustedBackendPublicKeyHex,
      skipPreflight: params.skipPreflight,
      audit: params.audit,
    },
  });
}

function mysqlColumns(row: MysqlPiiRow): Record<string, string | number | boolean | null> {
  return {
    record_key: row.recordKey ?? '',
    id: row.id,
    category: row.category,
    full_name: row.full_name,
    email: row.email,
    company: row.company,
    pass_type: row.pass_type,
    payload_summary: row.payload_summary,
    created_at: row.created_at,
  };
}

function postgresColumns(row: PostgresRow): Record<string, string | number | boolean | null> {
  return {
    record_key: row.recordKey ?? '',
    id: row.id,
    source: row.source,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    org: row.org,
    interaction_type: row.interaction_type,
    metadata: row.metadata,
    updated_at: row.updated_at,
  };
}

function mongoDocument(row: MongoDocument): Record<string, unknown> {
  return {
    record_key: row.recordKey ?? '',
    _id_display: row._id,
    collection: row.collection,
    doc: row.doc,
  };
}

export type OrchestratedInsertParams = {
  engine: DbEngine;
  parsed: MysqlInsertBody | PostgresInsertBody | MongoInsertBody;
  row: MysqlPiiRow | PostgresRow | MongoDocument;
  subjectReference: Uint8Array;
  canisterIdOverride?: string;
};

export type OrchestratedInsertResult =
  | { ok: true; insertedCount: number }
  | { ok: false; guard: RestoreGuardResult & { allowed: false } };

export async function orchestratedInsert(
  params: OrchestratedInsertParams
): Promise<OrchestratedInsertResult> {
  const { engine, parsed, row } = params;
  const connection =
    demoStorageMode() === 'real'
      ? await mutationConnectionForEngine(engine)
      : jsonMutationConnection(engine, parsed.deletionTarget, row);

  try {
    const result = await guardedInsert({
      connection,
      databaseType: engine,
      tableOrCollection: tableForEngine(engine),
      subjectReference: params.subjectReference,
      columns:
        engine === 'mysql'
          ? mysqlColumns(row as MysqlPiiRow)
          : engine === 'postgres'
            ? postgresColumns(row as PostgresRow)
            : undefined,
      document: engine === 'mongo' ? mongoDocument(row as MongoDocument) : undefined,
      client: restoreGuardClient(params.canisterIdOverride),
      policy: { failClosedOnLookupError: false },
    });

    if (result.insertedCount === 0) {
      return {
        ok: false,
        guard: {
          allowed: false,
          reason: 'local_deletion_registry',
          subjectReferenceHex: Buffer.from(params.subjectReference).toString('hex'),
        },
      };
    }

    return { ok: true, insertedCount: result.insertedCount };
  } catch (error) {
    if (error instanceof OffsignInsertBlockedError) {
      return { ok: false, guard: error.guard };
    }
    if (error instanceof Error && error.message === 'json_insert_failed') {
      return {
        ok: false,
        guard: {
          allowed: false,
          reason: 'local_deletion_registry',
          subjectReferenceHex: Buffer.from(params.subjectReference).toString('hex'),
        },
      };
    }
    throw error;
  }
}

export { OffsignDeleteNotExecutedError, OffsignInsertBlockedError };
