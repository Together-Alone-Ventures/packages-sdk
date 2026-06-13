import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import { MONGO_COLLECTION, MYSQL_TABLE, POSTGRES_TABLE } from './config.js';
import { JSON_SEED } from './jsonStore.js';
import { getMongoCollection, getMysqlPool, getPostgresPool } from './db/pools.js';

function mapMysqlRow(row: Record<string, unknown>): MysqlPiiRow {
  return {
    recordKey: String(row.record_key),
    id: Number(row.id),
    category: String(row.category ?? ''),
    full_name: String(row.full_name ?? ''),
    email: String(row.email ?? ''),
    company: String(row.company ?? ''),
    pass_type: String(row.pass_type ?? ''),
    payload_summary: String(row.payload_summary ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

function mapPostgresRow(row: Record<string, unknown>): PostgresRow {
  return {
    recordKey: String(row.record_key),
    id: String(row.id),
    source: String(row.source ?? ''),
    contact_name: String(row.contact_name ?? ''),
    contact_email: String(row.contact_email ?? ''),
    org: String(row.org ?? ''),
    interaction_type: String(row.interaction_type ?? ''),
    metadata: String(row.metadata ?? ''),
    updated_at: String(row.updated_at ?? ''),
  };
}

function mapMongoDoc(row: Record<string, unknown>): MongoDocument {
  return {
    recordKey: String(row.record_key),
    _id: String(row._id_display ?? row._id ?? ''),
    collection: String(row.collection ?? ''),
    doc: (row.doc as Record<string, unknown>) ?? {},
  };
}

export async function listRecords(engine: DbEngine): Promise<unknown[]> {
  if (engine === 'mysql') {
    const [rows] = await getMysqlPool().execute(`SELECT * FROM ${MYSQL_TABLE} ORDER BY id`);
    return (rows as Record<string, unknown>[]).map(mapMysqlRow);
  }
  if (engine === 'postgres') {
    const { rows } = await getPostgresPool().query(`SELECT * FROM ${POSTGRES_TABLE} ORDER BY id`);
    return rows.map(mapPostgresRow);
  }
  const coll = await getMongoCollection();
  const docs = await coll.find({}).sort({ record_key: 1 }).toArray();
  return docs.map(mapMongoDoc);
}

export async function recordAbsent(engine: DbEngine, recordKey: string): Promise<boolean> {
  if (engine === 'mysql') {
    const [rows] = await getMysqlPool().execute(
      `SELECT 1 AS found FROM ${MYSQL_TABLE} WHERE record_key = ? LIMIT 1`,
      [recordKey]
    );
    return (rows as unknown[]).length === 0;
  }
  if (engine === 'postgres') {
    const { rows } = await getPostgresPool().query(
      `SELECT 1 AS found FROM ${POSTGRES_TABLE} WHERE record_key = $1 LIMIT 1`,
      [recordKey]
    );
    return rows.length === 0;
  }
  const coll = await getMongoCollection();
  const doc = await coll.findOne({ record_key: recordKey });
  return doc == null;
}

export async function deleteRecord(engine: DbEngine, recordKey: string): Promise<boolean> {
  if (engine === 'mysql') {
    const [result] = await getMysqlPool().execute(
      `DELETE FROM ${MYSQL_TABLE} WHERE record_key = ?`,
      [recordKey]
    );
    return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  }
  if (engine === 'postgres') {
    const { rowCount } = await getPostgresPool().query(
      `DELETE FROM ${POSTGRES_TABLE} WHERE record_key = $1`,
      [recordKey]
    );
    return (rowCount ?? 0) > 0;
  }
  const coll = await getMongoCollection();
  const result = await coll.deleteOne({ record_key: recordKey });
  return result.deletedCount > 0;
}

export async function restoreRecord(engine: DbEngine, recordKey: string): Promise<boolean> {
  const seed = JSON_SEED[engine];
  if (engine === 'mysql') {
    const row = (seed as MysqlPiiRow[]).find((r) => r.recordKey === recordKey);
    if (!row?.recordKey) return false;
    const [existing] = await getMysqlPool().execute(
      `SELECT 1 FROM ${MYSQL_TABLE} WHERE record_key = ?`,
      [recordKey]
    );
    if ((existing as unknown[]).length > 0) return false;
    await getMysqlPool().execute(
      `INSERT INTO ${MYSQL_TABLE}
        (record_key, id, category, full_name, email, company, pass_type, payload_summary, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        row.recordKey,
        row.id,
        row.category,
        row.full_name,
        row.email,
        row.company,
        row.pass_type,
        row.payload_summary,
        row.created_at,
      ]
    );
    return true;
  }
  if (engine === 'postgres') {
    const row = (seed as PostgresRow[]).find((r) => r.recordKey === recordKey);
    if (!row?.recordKey) return false;
    const { rows } = await getPostgresPool().query(
      `SELECT 1 FROM ${POSTGRES_TABLE} WHERE record_key = $1`,
      [recordKey]
    );
    if (rows.length > 0) return false;
    await getPostgresPool().query(
      `INSERT INTO ${POSTGRES_TABLE}
        (record_key, id, source, contact_name, contact_email, org, interaction_type, metadata, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        row.recordKey,
        row.id,
        row.source,
        row.contact_name,
        row.contact_email,
        row.org,
        row.interaction_type,
        row.metadata,
        row.updated_at,
      ]
    );
    return true;
  }
  const doc = (seed as MongoDocument[]).find((d) => d.recordKey === recordKey);
  if (!doc?.recordKey) return false;
  const coll = await getMongoCollection();
  const existing = await coll.findOne({ record_key: recordKey });
  if (existing) return false;
  await coll.insertOne({
    record_key: doc.recordKey,
    _id_display: doc._id,
    collection: doc.collection,
    doc: doc.doc,
  });
  return true;
}
