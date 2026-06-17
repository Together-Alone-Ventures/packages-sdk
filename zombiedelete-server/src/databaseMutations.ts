import type {
  SqlAbsentRecordData,
  WiredDeletionData,
  WiredDeletionDatabaseType,
} from '@together-alone/zombiedelete-core';
import {
  OffsignInvalidDatabaseIdentifierError,
  assertSqlIdentifier,
  buildSqlAbsentCheckQuery,
  type MongoFindable,
} from './databaseVerifier.js';

export type SqlColumnValues = Record<string, string | number | boolean | null>;

export type MongoDeletable = MongoFindable & {
  deleteOne: (filter: Record<string, unknown>) => Promise<{ deletedCount?: number }>;
};

export type MongoInsertable = {
  insertOne: (document: Record<string, unknown>) => Promise<unknown>;
};

function normalizeSqlLookup(data: WiredDeletionData): SqlAbsentRecordData {
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return { keyValue: data };
  }
  if ('keyValue' in data && data.keyValue !== undefined) {
    return data as SqlAbsentRecordData;
  }
  throw new OffsignInvalidDatabaseIdentifierError(
    'SQL databaseType requires data as a primitive key or { keyField?, keyValue }'
  );
}

function normalizeMongoFilter(data: WiredDeletionData): Record<string, unknown> {
  if (typeof data === 'object' && data !== null && !('keyValue' in data)) {
    return data;
  }
  const lookup = normalizeSqlLookup(data);
  const keyField = lookup.keyField ?? 'id';
  return { [keyField]: lookup.keyValue };
}

function validateColumnNames(columns: SqlColumnValues): string[] {
  const names = Object.keys(columns);
  if (names.length === 0) {
    throw new OffsignInvalidDatabaseIdentifierError('columns must include at least one field');
  }
  return names.map((name) => assertSqlIdentifier(name, 'column'));
}

function validateMongoDocumentKeys(document: Record<string, unknown>): void {
  const keys = Object.keys(document);
  if (keys.length === 0) {
    throw new OffsignInvalidDatabaseIdentifierError('document must include at least one field');
  }
  for (const key of keys) {
    assertSqlIdentifier(key, 'document key');
  }
}

/** Parameterized `DELETE … WHERE keyField = ?` — identifiers validated, value bound. */
export function buildSqlDeleteQuery(params: {
  tableOrCollection: string;
  data: SqlAbsentRecordData;
  databaseType: 'postgres' | 'mysql';
}): { sql: string; params: unknown[] } {
  const table = assertSqlIdentifier(params.tableOrCollection, 'tableOrCollection');
  const keyField = assertSqlIdentifier(params.data.keyField ?? 'id', 'keyField');
  const placeholder = params.databaseType === 'postgres' ? '$1' : '?';
  const sql = `DELETE FROM ${table} WHERE ${keyField} = ${placeholder}`;
  return { sql, params: [params.data.keyValue] };
}

/** Parameterized `INSERT INTO … (cols) VALUES (…)` — column names validated, values bound. */
export function buildSqlInsertQuery(params: {
  tableOrCollection: string;
  columns: SqlColumnValues;
  databaseType: 'postgres' | 'mysql';
}): { sql: string; params: unknown[] } {
  const table = assertSqlIdentifier(params.tableOrCollection, 'tableOrCollection');
  const columnNames = validateColumnNames(params.columns);
  const values = columnNames.map((name) => params.columns[name]);
  if (params.databaseType === 'postgres') {
    const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${placeholders})`;
    return { sql, params: values };
  }
  const placeholders = columnNames.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columnNames.join(', ')}) VALUES (${placeholders})`;
  return { sql, params: values };
}

export type ExecuteDeleteParams = {
  connection: unknown;
  databaseType: WiredDeletionDatabaseType;
  tableOrCollection: string;
  data: WiredDeletionData;
};

export type ExecuteDeleteResult = {
  deletedCount: number;
};

export async function executeParameterizedDelete(
  params: ExecuteDeleteParams
): Promise<ExecuteDeleteResult> {
  const { connection, databaseType, tableOrCollection, data } = params;
  if (databaseType === 'postgres') {
    const pool = connection as { query: (sql: string, params: unknown[]) => Promise<{ rowCount?: number | null }> };
    const built = buildSqlDeleteQuery({
      tableOrCollection,
      data: normalizeSqlLookup(data),
      databaseType: 'postgres',
    });
    const result = await pool.query(built.sql, built.params);
    return { deletedCount: result.rowCount ?? 0 };
  }
  if (databaseType === 'mysql') {
    const pool = connection as {
      execute: (sql: string, params: unknown[]) => Promise<[{ affectedRows?: number }, unknown]>;
    };
    const built = buildSqlDeleteQuery({
      tableOrCollection,
      data: normalizeSqlLookup(data),
      databaseType: 'mysql',
    });
    const [result] = await pool.execute(built.sql, built.params);
    const deletedCount = result.affectedRows ?? 0;
    return { deletedCount };
  }
  const coll = connection as MongoDeletable;
  const filter = normalizeMongoFilter(data);
  const result = await coll.deleteOne(filter);
  return { deletedCount: result.deletedCount ?? 0 };
}

export type ExecuteInsertParams = {
  connection: unknown;
  databaseType: WiredDeletionDatabaseType;
  tableOrCollection: string;
  columns?: SqlColumnValues;
  document?: Record<string, unknown>;
};

export type ExecuteInsertResult = {
  insertedCount: number;
};

export async function executeParameterizedInsert(
  params: ExecuteInsertParams
): Promise<ExecuteInsertResult> {
  const { connection, databaseType, tableOrCollection, columns, document } = params;
  if (databaseType === 'mongo') {
    if (!document) {
      throw new OffsignInvalidDatabaseIdentifierError('mongo insert requires document');
    }
    validateMongoDocumentKeys(document);
    const coll = connection as MongoInsertable;
    await coll.insertOne(document);
    return { insertedCount: 1 };
  }
  if (!columns) {
    throw new OffsignInvalidDatabaseIdentifierError('SQL insert requires columns');
  }
  if (databaseType === 'postgres') {
    const pool = connection as { query: (sql: string, params: unknown[]) => Promise<unknown> };
    const built = buildSqlInsertQuery({
      tableOrCollection,
      columns,
      databaseType: 'postgres',
    });
    await pool.query(built.sql, built.params);
    return { insertedCount: 1 };
  }
  if (databaseType === 'mysql') {
    const pool = connection as { execute: (sql: string, params: unknown[]) => Promise<unknown> };
    const built = buildSqlInsertQuery({
      tableOrCollection,
      columns,
      databaseType: 'mysql',
    });
    await pool.execute(built.sql, built.params);
    return { insertedCount: 1 };
  }
  throw new OffsignInvalidDatabaseIdentifierError(
    `Unsupported databaseType "${databaseType}" — use postgres | mysql | mongo`
  );
}

/** Re-export for orchestrators that need the absent-check query after delete. */
export { buildSqlAbsentCheckQuery, normalizeMongoFilter, normalizeSqlLookup };
