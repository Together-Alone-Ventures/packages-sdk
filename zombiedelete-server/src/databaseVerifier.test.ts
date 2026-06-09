import { describe, expect, it, vi } from 'vitest';
import { OffsignDatabaseVerifierRequiredError } from '@together-alone/zombiedelete-core';
import {
  buildSqlAbsentCheckQuery,
  createDatabaseVerifier,
  createMongoVerifier,
  createMysqlVerifier,
  createPostgresVerifier,
  createWiredDeletionVerifier,
  OffsignInvalidDatabaseIdentifierError,
} from './databaseVerifier.js';

describe('databaseVerifier', () => {
  it('createDatabaseVerifier rejects missing connection', () => {
    expect(() =>
      createDatabaseVerifier({
        engine: 'postgres',
        connection: undefined as unknown as object,
        verifyAbsent: async () => ({ absent: true }),
      })
    ).toThrow(OffsignDatabaseVerifierRequiredError);
  });

  it('createPostgresVerifier uses wired pool', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const verifier = createPostgresVerifier({
      connection: { query },
      resolveQuery: () => ({ sql: 'SELECT 1 FROM t WHERE id = $1', params: ['42'] }),
    });
    const result = await verifier.verifyAbsent({
      subjectReferenceHex: 'aa'.repeat(32),
      deletionEventId: 'evt-1',
      sourceLocator: 'users/42',
    });
    expect(result.absent).toBe(true);
    expect(query).toHaveBeenCalledOnce();
  });

  it('createMysqlVerifier reports row still present', async () => {
    const execute = vi.fn().mockResolvedValue([[{ id: 1 }], []]);
    const verifier = createMysqlVerifier({
      connection: { execute },
      resolveQuery: { sql: 'SELECT id FROM t WHERE id = ?', params: [1] },
    });
    const result = await verifier.verifyAbsent({
      subjectReferenceHex: 'bb'.repeat(32),
      deletionEventId: 'evt-2',
    });
    expect(result.absent).toBe(false);
    expect(result.detail).toBe('mysql_row_still_visible');
  });

  it('buildSqlAbsentCheckQuery concatenates validated identifiers only', () => {
    const built = buildSqlAbsentCheckQuery({
      tableOrCollection: 'contacts',
      data: { keyField: 'record_key', keyValue: 'user-42' },
      databaseType: 'postgres',
    });
    expect(built.sql).toBe(
      'SELECT 1 AS found FROM contacts WHERE record_key = $1 LIMIT 1'
    );
    expect(built.params).toEqual(['user-42']);
  });

  it('rejects unsafe SQL identifiers', () => {
    expect(() =>
      buildSqlAbsentCheckQuery({
        tableOrCollection: 'contacts; DROP TABLE users',
        data: { keyValue: 'x' },
        databaseType: 'mysql',
      })
    ).toThrow(OffsignInvalidDatabaseIdentifierError);
  });

  it('createWiredDeletionVerifier wires postgres pool + table + data', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const verifier = createWiredDeletionVerifier({
      connection: { query },
      databaseType: 'postgres',
      tableOrCollection: 'conference_pii',
      data: { keyField: 'record_key', keyValue: 'rk-1' },
    });
    const result = await verifier.verifyAbsent({
      subjectReferenceHex: 'dd'.repeat(32),
      deletionEventId: 'evt-wired',
    });
    expect(result.absent).toBe(true);
    expect(query).toHaveBeenCalledWith(
      'SELECT 1 AS found FROM conference_pii WHERE record_key = $1 LIMIT 1',
      ['rk-1']
    );
  });

  it('createWiredDeletionVerifier wires mongo collection + filter data', async () => {
    const findOne = vi.fn().mockResolvedValue({ _id: 'still-here' });
    const verifier = createWiredDeletionVerifier({
      connection: { findOne },
      databaseType: 'mongo',
      tableOrCollection: 'users',
      data: { _id: 'abc' },
    });
    const result = await verifier.verifyAbsent({
      subjectReferenceHex: 'ee'.repeat(32),
      deletionEventId: 'evt-mongo',
    });
    expect(result.absent).toBe(false);
    expect(findOne).toHaveBeenCalledWith({ _id: 'abc' });
  });

  it('createMongoVerifier reports absent when findOne returns null', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const verifier = createMongoVerifier({
      connection: { findOne },
      resolveFilter: { _id: 'abc' },
    });
    const result = await verifier.verifyAbsent({
      subjectReferenceHex: 'cc'.repeat(32),
      deletionEventId: 'evt-3',
    });
    expect(result.absent).toBe(true);
    expect(findOne).toHaveBeenCalledWith({ _id: 'abc' });
  });
});
