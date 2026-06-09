import {
  bytesToHex,
  OffsignDatabaseVerifierRequiredError,
  type DatabaseVerifier,
  type OffsignDatabaseVerification,
  type SqlAbsentRecordData,
  type VerifyDeletionContext,
  type VerifyDeletionResult,
  type WiredDeletionData,
  type WiredDeletionProps,
} from '@together-alone/zombiedelete-core';

export function assertDatabaseVerifier(
  verifier: DatabaseVerifier | undefined | null
): DatabaseVerifier {
  if (!verifier) {
    throw new OffsignDatabaseVerifierRequiredError();
  }
  if (verifier.connection == null) {
    throw new OffsignDatabaseVerifierRequiredError(
      'databaseVerifier.connection is required — wire your pool, client, or driver handle'
    );
  }
  if (typeof verifier.verifyAbsent !== 'function') {
    throw new OffsignDatabaseVerifierRequiredError('databaseVerifier.verifyAbsent must be a function');
  }
  if (!verifier.engine || String(verifier.engine).trim() === '') {
    throw new OffsignDatabaseVerifierRequiredError('databaseVerifier.engine is required');
  }
  return verifier;
}

export function createDatabaseVerifier<TConnection>(
  spec: DatabaseVerifier<TConnection>
): DatabaseVerifier<TConnection> {
  return assertDatabaseVerifier(spec) as DatabaseVerifier<TConnection>;
}

export function verifyDeletionContextFromOffsignInput(input: {
  subjectReference: Uint8Array;
  deletionEventId: string;
  sourceLocator?: string;
}): VerifyDeletionContext {
  return {
    subjectReferenceHex: bytesToHex(input.subjectReference).toLowerCase(),
    deletionEventId: input.deletionEventId,
    sourceLocator: input.sourceLocator,
  };
}

export async function runDatabaseAbsentCheck(
  verifier: DatabaseVerifier,
  ctx: VerifyDeletionContext
): Promise<VerifyDeletionResult> {
  return verifier.verifyAbsent(ctx);
}

/** Minimal Postgres pool/client surface (e.g. `pg.Pool`). */
export type PostgresQueryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

export type PostgresVerifierQuery =
  | { sql: string; params?: unknown[] }
  | ((ctx: VerifyDeletionContext) => { sql: string; params?: unknown[] });

export function createPostgresVerifier(params: {
  connection: PostgresQueryable;
  resolveQuery: PostgresVerifierQuery;
  absentWhen?: (rows: unknown[]) => boolean;
}): DatabaseVerifier<PostgresQueryable> {
  const absentWhen = params.absentWhen ?? ((rows) => rows.length === 0);
  return createDatabaseVerifier({
    engine: 'postgres',
    connection: params.connection,
    verifyAbsent: async (ctx) => {
      const resolved =
        typeof params.resolveQuery === 'function' ? params.resolveQuery(ctx) : params.resolveQuery;
      const { rows } = await params.connection.query(resolved.sql, resolved.params);
      const absent = absentWhen(rows);
      return {
        absent,
        checkedAtUnixMs: Date.now(),
        detail: absent ? undefined : 'postgres_row_still_visible',
      };
    },
  });
}

/** Minimal MySQL pool surface (e.g. `mysql2` promise pool). */
export type MysqlQueryable = {
  execute: (sql: string, params?: unknown[]) => Promise<[unknown[], unknown]>;
};

export type MysqlVerifierQuery =
  | { sql: string; params?: unknown[] }
  | ((ctx: VerifyDeletionContext) => { sql: string; params?: unknown[] });

export function createMysqlVerifier(params: {
  connection: MysqlQueryable;
  resolveQuery: MysqlVerifierQuery;
  absentWhen?: (rows: unknown[]) => boolean;
}): DatabaseVerifier<MysqlQueryable> {
  const absentWhen = params.absentWhen ?? ((rows) => rows.length === 0);
  return createDatabaseVerifier({
    engine: 'mysql',
    connection: params.connection,
    verifyAbsent: async (ctx) => {
      const resolved =
        typeof params.resolveQuery === 'function' ? params.resolveQuery(ctx) : params.resolveQuery;
      const [rows] = await params.connection.execute(resolved.sql, resolved.params);
      const rowList = Array.isArray(rows) ? rows : [];
      const absent = absentWhen(rowList);
      return {
        absent,
        checkedAtUnixMs: Date.now(),
        detail: absent ? undefined : 'mysql_row_still_visible',
      };
    },
  });
}

/** Minimal MongoDB collection surface (e.g. native driver or Mongoose-backed). */
export type MongoFindable = {
  findOne: (filter: Record<string, unknown>) => Promise<unknown | null>;
};

export type MongoVerifierFilter =
  | Record<string, unknown>
  | ((ctx: VerifyDeletionContext) => Record<string, unknown>);

export function createMongoVerifier(params: {
  connection: MongoFindable;
  resolveFilter: MongoVerifierFilter;
  absentWhen?: (doc: unknown | null) => boolean;
}): DatabaseVerifier<MongoFindable> {
  const absentWhen = params.absentWhen ?? ((doc) => doc == null);
  return createDatabaseVerifier({
    engine: 'mongo',
    connection: params.connection,
    verifyAbsent: async (ctx) => {
      const filter =
        typeof params.resolveFilter === 'function' ? params.resolveFilter(ctx) : params.resolveFilter;
      const doc = await params.connection.findOne(filter);
      const absent = absentWhen(doc);
      return {
        absent,
        checkedAtUnixMs: Date.now(),
        detail: absent ? undefined : 'mongo_document_still_visible',
      };
    },
  });
}

const SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class OffsignInvalidDatabaseIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OffsignInvalidDatabaseIdentifierError';
  }
}

function assertSqlIdentifier(name: string, label: string): string {
  const trimmed = name.trim();
  if (!SQL_IDENTIFIER.test(trimmed)) {
    throw new OffsignInvalidDatabaseIdentifierError(
      `${label} must match ${SQL_IDENTIFIER.source} (got "${name}")`
    );
  }
  return trimmed;
}

export type CreateWiredDeletionVerifierParams = WiredDeletionProps;

export function hasWiredDeletionProps(
  input: Partial<WiredDeletionProps> & { databaseVerifier?: DatabaseVerifier }
): input is WiredDeletionProps {
  return (
    input.connection != null &&
    Boolean(input.databaseType) &&
    Boolean(input.tableOrCollection) &&
    input.data !== undefined
  );
}

/** Resolves inline wired props or a pre-built `databaseVerifier`. */
export function resolveDatabaseVerifier(input: OffsignDatabaseVerification): DatabaseVerifier {
  if ('databaseVerifier' in input && input.databaseVerifier) {
    return assertDatabaseVerifier(input.databaseVerifier);
  }
  if (hasWiredDeletionProps(input)) {
    return createWiredDeletionVerifier(input);
  }
  throw new OffsignDatabaseVerifierRequiredError();
}

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
    return data as Record<string, unknown>;
  }
  const lookup = normalizeSqlLookup(data);
  const keyField = lookup.keyField ?? 'id';
  return { [keyField]: lookup.keyValue };
}

/** Builds a parameterized SQL absent-check (table/column names concatenated after validation). */
export function buildSqlAbsentCheckQuery(params: {
  tableOrCollection: string;
  data: SqlAbsentRecordData;
  databaseType: 'postgres' | 'mysql';
  softDeleteColumn?: string;
}): { sql: string; params: unknown[] } {
  const table = assertSqlIdentifier(params.tableOrCollection, 'tableOrCollection');
  const keyField = assertSqlIdentifier(params.data.keyField ?? 'id', 'keyField');
  const placeholder = params.databaseType === 'postgres' ? '$1' : '?';
  const paramsList: unknown[] = [params.data.keyValue];

  if (params.softDeleteColumn) {
    const softCol = assertSqlIdentifier(params.softDeleteColumn, 'softDeleteColumn');
    const sql = `SELECT 1 AS found FROM ${table} WHERE ${keyField} = ${placeholder} AND ${softCol} IS NULL LIMIT 1`;
    return { sql, params: paramsList };
  }

  const sql = `SELECT 1 AS found FROM ${table} WHERE ${keyField} = ${placeholder} LIMIT 1`;
  return { sql, params: paramsList };
}

/**
 * High-level helper: wire connection + engine + table/collection + lookup data.
 * SQL table/column names are concatenated after identifier validation; values stay parameterized.
 */
export function createWiredDeletionVerifier(
  params: CreateWiredDeletionVerifierParams
): DatabaseVerifier {
  const { connection, databaseType, tableOrCollection, data, softDeleteColumn } = params;

  if (connection == null) {
    throw new OffsignDatabaseVerifierRequiredError(
      'connection is required — pass your pool, client, or collection handle'
    );
  }

  switch (databaseType) {
    case 'postgres':
      return createPostgresVerifier({
        connection: connection as PostgresQueryable,
        resolveQuery: () =>
          buildSqlAbsentCheckQuery({
            tableOrCollection,
            data: normalizeSqlLookup(data),
            databaseType: 'postgres',
            softDeleteColumn,
          }),
      });
    case 'mysql':
      return createMysqlVerifier({
        connection: connection as MysqlQueryable,
        resolveQuery: () =>
          buildSqlAbsentCheckQuery({
            tableOrCollection,
            data: normalizeSqlLookup(data),
            databaseType: 'mysql',
            softDeleteColumn,
          }),
      });
    case 'mongo': {
      const collection = connection as MongoFindable;
      const filter = normalizeMongoFilter(data);
      return createMongoVerifier({
        connection: collection,
        resolveFilter: filter,
      });
    }
    default:
      throw new OffsignInvalidDatabaseIdentifierError(
        `Unsupported databaseType "${databaseType as string}" — use postgres | mysql | mongo`
      );
  }
}

/** Vitest/dev helper — not for production bypass. */
export function createTestDatabaseVerifier(
  verifyAbsent: DatabaseVerifier['verifyAbsent'],
  engine: DatabaseVerifier['engine'] = 'test'
): DatabaseVerifier<{ tag: 'test-connection' }> {
  return createDatabaseVerifier({
    engine,
    connection: { tag: 'test-connection' },
    verifyAbsent,
  });
}
