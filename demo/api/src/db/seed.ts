import {
  MONGO_DOCUMENTS,
  MYSQL_ROWS,
  POSTGRES_ROWS,
} from '../../../shared/demoDatabases.js';
import {
  MONGO_COLLECTION,
  MYSQL_TABLE,
  POSTGRES_TABLE,
} from '../config.js';
import { getMongoCollection, getMysqlPool, getPostgresPool } from './pools.js';

export async function ensureRealSchemas(): Promise<void> {
  const pg = getPostgresPool();
  await pg.query(`
    CREATE TABLE IF NOT EXISTS ${POSTGRES_TABLE} (
      record_key TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      source TEXT,
      contact_name TEXT,
      contact_email TEXT,
      org TEXT,
      interaction_type TEXT,
      metadata TEXT,
      updated_at TEXT
    )
  `);

  const mysql = getMysqlPool();
  await mysql.execute(`
    CREATE TABLE IF NOT EXISTS ${MYSQL_TABLE} (
      record_key VARCHAR(128) PRIMARY KEY,
      id INT NOT NULL,
      category VARCHAR(64),
      full_name VARCHAR(256),
      email VARCHAR(256),
      company VARCHAR(256),
      pass_type VARCHAR(64),
      payload_summary TEXT,
      created_at VARCHAR(32)
    )
  `);

  const mongo = await getMongoCollection();
  await mongo.createIndex({ record_key: 1 }, { unique: true });
}

export async function seedRealDatabases(): Promise<{
  mysql: number;
  postgres: number;
  mongo: number;
}> {
  await ensureRealSchemas();

  const pg = getPostgresPool();
  await pg.query(`TRUNCATE ${POSTGRES_TABLE}`);
  for (const row of POSTGRES_ROWS) {
    if (!row.recordKey) continue;
    await pg.query(
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
  }

  const mysql = getMysqlPool();
  await mysql.execute(`TRUNCATE TABLE ${MYSQL_TABLE}`);
  for (const row of MYSQL_ROWS) {
    if (!row.recordKey) continue;
    await mysql.execute(
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
  }

  const mongo = await getMongoCollection();
  await mongo.deleteMany({});
  const docs = MONGO_DOCUMENTS.filter((d) => d.recordKey).map((d) => ({
    record_key: d.recordKey,
    _id_display: d._id,
    collection: d.collection,
    doc: d.doc,
  }));
  if (docs.length > 0) {
    await mongo.insertMany(docs);
  }

  return {
    mysql: MYSQL_ROWS.filter((r) => r.recordKey).length,
    postgres: POSTGRES_ROWS.filter((r) => r.recordKey).length,
    mongo: docs.length,
  };
}
