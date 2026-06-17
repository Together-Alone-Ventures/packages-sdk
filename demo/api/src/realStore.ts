import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import { deletionTargetForRow } from '../../shared/deletionSubject.js';
import { MONGO_COLLECTION, MYSQL_TABLE, POSTGRES_TABLE } from './config.js';
import { getJsonSeed } from './jsonStore.js';
import { getMongoCollection, getMysqlPool, getPostgresPool } from './db/pools.js';
import { wiredDataForDeletionTarget } from './deletionResolve.js';

type Row = MysqlPiiRow | PostgresRow | MongoDocument;

function mapMysqlRow(row: Record<string, unknown>): MysqlPiiRow {
  return {
    recordKey: String(row.record_key ?? ''),
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
    recordKey: String(row.record_key ?? ''),
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
    recordKey: String(row.record_key ?? ''),
    _id: String(row._id_display ?? row._id ?? ''),
    collection: String(row.collection ?? ''),
    doc: (row.doc as Record<string, unknown>) ?? {},
  };
}

function mongoFilterForTarget(target: DeletionTarget): Record<string, unknown> {
  return wiredDataForDeletionTarget(target) as Record<string, unknown>;
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

export async function recordAbsentForTarget(
  engine: DbEngine,
  target: DeletionTarget
): Promise<boolean> {
  if (engine === 'mysql') {
    const [rows] = await getMysqlPool().execute(
      `SELECT 1 AS found FROM ${MYSQL_TABLE} WHERE ${target.keyField} = ? LIMIT 1`,
      [target.keyValue]
    );
    return (rows as unknown[]).length === 0;
  }
  if (engine === 'postgres') {
    const { rows } = await getPostgresPool().query(
      `SELECT 1 AS found FROM ${POSTGRES_TABLE} WHERE ${target.keyField} = $1 LIMIT 1`,
      [target.keyValue]
    );
    return rows.length === 0;
  }
  const coll = await getMongoCollection();
  const doc = await coll.findOne(mongoFilterForTarget(target));
  return doc == null;
}

async function findTargetByHandle(
  engine: DbEngine,
  handle: string
): Promise<DeletionTarget | null> {
  const rows = (await listRecords(engine)) as Row[];
  for (const row of rows) {
    const target = deletionTargetForRow(engine, row);
    if (target?.handle === handle) return target;
  }
  return null;
}

export async function deleteRecordByHandle(engine: DbEngine, handle: string): Promise<boolean> {
  const target = await findTargetByHandle(engine, handle);
  if (!target) return false;

  if (engine === 'mysql') {
    const [result] = await getMysqlPool().execute(
      `DELETE FROM ${MYSQL_TABLE} WHERE ${target.keyField} = ?`,
      [target.keyValue]
    );
    return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  }
  if (engine === 'postgres') {
    const { rowCount } = await getPostgresPool().query(
      `DELETE FROM ${POSTGRES_TABLE} WHERE ${target.keyField} = $1`,
      [target.keyValue]
    );
    return (rowCount ?? 0) > 0;
  }
  const coll = await getMongoCollection();
  const result = await coll.deleteOne(mongoFilterForTarget(target));
  return result.deletedCount > 0;
}

export async function restoreRecordByHandle(engine: DbEngine, handle: string): Promise<boolean> {
  const seed = getJsonSeed()[engine] as Row[];
  const row = seed.find((entry) => deletionTargetForRow(engine, entry)?.handle === handle);
  if (!row) return false;

  const recordKey = deletionTargetForRow(engine, row)?.handle ?? row.recordKey ?? handle;

  if (engine === 'mysql') {
    const r = row as MysqlPiiRow;
    const [existing] = await getMysqlPool().execute(
      `SELECT 1 FROM ${MYSQL_TABLE} WHERE email = ?`,
      [r.email]
    );
    if ((existing as unknown[]).length > 0) return false;
    await getMysqlPool().execute(
      `INSERT INTO ${MYSQL_TABLE}
        (record_key, id, category, full_name, email, company, pass_type, payload_summary, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        recordKey,
        r.id,
        r.category,
        r.full_name,
        r.email,
        r.company,
        r.pass_type,
        r.payload_summary,
        r.created_at,
      ]
    );
    return true;
  }
  if (engine === 'postgres') {
    const r = row as PostgresRow;
    const { rows } = await getPostgresPool().query(
      `SELECT 1 FROM ${POSTGRES_TABLE} WHERE contact_email = $1`,
      [r.contact_email]
    );
    if (rows.length > 0) return false;
    await getPostgresPool().query(
      `INSERT INTO ${POSTGRES_TABLE}
        (record_key, id, source, contact_name, contact_email, org, interaction_type, metadata, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        recordKey,
        r.id,
        r.source,
        r.contact_name,
        r.contact_email,
        r.org,
        r.interaction_type,
        r.metadata,
        r.updated_at,
      ]
    );
    return true;
  }
  const doc = row as MongoDocument;
  const coll = await getMongoCollection();
  const filter = mongoFilterForTarget(deletionTargetForRow('mongo', doc)!);
  const existing = await coll.findOne(filter);
  if (existing) return false;
  await coll.insertOne({
    record_key: recordKey,
    _id_display: doc._id,
    collection: doc.collection,
    doc: doc.doc,
  });
  return true;
}

export async function insertRecord(engine: DbEngine, row: unknown): Promise<boolean> {
  const target = deletionTargetForRow(engine, row as Row);
  if (!target) return false;
  const recordKey = target.handle;

  if (engine === 'mysql') {
    const r = row as MysqlPiiRow;
    const [existing] = await getMysqlPool().execute(
      `SELECT 1 FROM ${MYSQL_TABLE} WHERE ${target.keyField} = ?`,
      [target.keyValue]
    );
    if ((existing as unknown[]).length > 0) return false;
    await getMysqlPool().execute(
      `INSERT INTO ${MYSQL_TABLE}
        (record_key, id, category, full_name, email, company, pass_type, payload_summary, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        recordKey,
        r.id,
        r.category,
        r.full_name,
        r.email,
        r.company,
        r.pass_type,
        r.payload_summary,
        r.created_at,
      ]
    );
    return true;
  }
  if (engine === 'postgres') {
    const r = row as PostgresRow;
    const { rows } = await getPostgresPool().query(
      `SELECT 1 FROM ${POSTGRES_TABLE} WHERE ${target.keyField} = $1`,
      [target.keyValue]
    );
    if (rows.length > 0) return false;
    await getPostgresPool().query(
      `INSERT INTO ${POSTGRES_TABLE}
        (record_key, id, source, contact_name, contact_email, org, interaction_type, metadata, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        recordKey,
        r.id,
        r.source,
        r.contact_name,
        r.contact_email,
        r.org,
        r.interaction_type,
        r.metadata,
        r.updated_at,
      ]
    );
    return true;
  }
  const d = row as MongoDocument;
  const coll = await getMongoCollection();
  const filter = mongoFilterForTarget(target);
  const existing = await coll.findOne(filter);
  if (existing) return false;
  await coll.insertOne({
    record_key: recordKey,
    _id_display: d._id,
    collection: d.collection,
    doc: d.doc,
  });
  return true;
}
