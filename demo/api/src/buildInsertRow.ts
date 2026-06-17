import type { MongoDocument, MysqlPiiRow, PostgresRow } from '../../shared/demoDatabases.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import {
  DEFAULT_DELETION_KEYS,
  deletionKeyConfig,
  deletionTargetFromInsert,
  type DeletionTarget,
} from '../../shared/deletionSubject.js';
import { MONGO_COLLECTION } from './config.js';

export type MysqlInsertBody = {
  deletionKeyField: string;
  deletionTarget: DeletionTarget;
  id: number;
  category: string;
  full_name: string;
  email: string;
  company: string;
  pass_type: string;
  payload_summary: string;
  created_at: string;
};

export type PostgresInsertBody = {
  deletionKeyField: string;
  deletionTarget: DeletionTarget;
  id: string;
  source: string;
  contact_name: string;
  contact_email: string;
  org: string;
  interaction_type: string;
  metadata: string;
  updated_at: string;
};

export type MongoInsertBody = {
  deletionKeyField: string;
  deletionTarget: DeletionTarget;
  collection?: string;
  doc: Record<string, unknown>;
};

function requireString(value: unknown, field: string): string {
  const s = String(value ?? '').trim();
  if (!s) throw new Error(`missing_${field}`);
  return s;
}

function optionalString(value: unknown): string {
  return String(value ?? '').trim();
}

function nextMysqlId(rows: MysqlPiiRow[]): number {
  const max = rows.reduce((highest, row) => Math.max(highest, row.id ?? 0), 0);
  return max + 1;
}

function nextPostgresId(rows: PostgresRow[]): string {
  const max = rows.reduce((highest, row) => {
    const match = row.id.match(/(\d+)\s*$/);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `cnt_${max + 1}`;
}

function extractMongoKeyRaw(doc: Record<string, unknown>, keyField: string): string | null {
  const config = deletionKeyConfig('mongo', keyField);
  if (config.keyField === 'email') {
    if (typeof doc.email === 'string') return doc.email;
    if (doc.contact && typeof doc.contact === 'object') {
      const email = (doc.contact as { email?: string }).email;
      if (typeof email === 'string') return email;
    }
    return null;
  }
  if (config.keyField === 'title' && typeof doc.title === 'string') return doc.title;
  const v = doc[config.keyField];
  return v != null ? String(v) : null;
}

export async function resolveInsertBody(
  engine: DbEngine,
  body: Record<string, unknown>,
  existing: unknown[]
): Promise<MysqlInsertBody | PostgresInsertBody | MongoInsertBody> {
  const now = new Date();
  const mysqlTs = now.toISOString().slice(0, 19).replace('T', ' ');
  const pgTs = now.toISOString();
  const deletionKeyField =
    optionalString(body.deletionKeyField) || DEFAULT_DELETION_KEYS[engine].keyField;

  if (engine === 'mysql') {
    const rows = existing as MysqlPiiRow[];
    const id = nextMysqlId(rows);
    const email = requireString(body.email, 'email');
    const keyRaw =
      deletionKeyConfig('mysql', deletionKeyField).keyField === 'email'
        ? email
        : deletionKeyConfig('mysql', deletionKeyField).keyField === 'id'
          ? String(id)
          : requireString(body[deletionKeyField], deletionKeyField);
    const deletionTarget = deletionTargetFromInsert('mysql', deletionKeyField, keyRaw);
    return {
      deletionKeyField,
      deletionTarget,
      id,
      category: requireString(body.category, 'category'),
      full_name: requireString(body.full_name, 'full_name'),
      email,
      company: requireString(body.company, 'company'),
      pass_type: requireString(body.pass_type, 'pass_type'),
      payload_summary: requireString(body.payload_summary, 'payload_summary'),
      created_at: optionalString(body.created_at) || mysqlTs,
    };
  }

  if (engine === 'postgres') {
    const rows = existing as PostgresRow[];
    const id = nextPostgresId(rows);
    const contact_email = requireString(body.contact_email, 'contact_email');
    const keyRaw =
      deletionKeyConfig('postgres', deletionKeyField).keyField === 'contact_email'
        ? contact_email
        : deletionKeyConfig('postgres', deletionKeyField).keyField === 'id'
          ? id
          : requireString(body[deletionKeyField], deletionKeyField);
    const deletionTarget = deletionTargetFromInsert('postgres', deletionKeyField, keyRaw);
    return {
      deletionKeyField,
      deletionTarget,
      id,
      source: requireString(body.source, 'source'),
      contact_name: requireString(body.contact_name, 'contact_name'),
      contact_email,
      org: requireString(body.org, 'org'),
      interaction_type: requireString(body.interaction_type, 'interaction_type'),
      metadata: requireString(body.metadata, 'metadata'),
      updated_at: optionalString(body.updated_at) || pgTs,
    };
  }

  let doc: Record<string, unknown>;
  if (body.doc && typeof body.doc === 'object' && !Array.isArray(body.doc)) {
    doc = body.doc as Record<string, unknown>;
  } else if (typeof body.docJson === 'string') {
    doc = JSON.parse(body.docJson) as Record<string, unknown>;
  } else {
    throw new Error('invalid_doc');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('invalid_doc');

  const keyRaw = extractMongoKeyRaw(doc, deletionKeyField);
  if (!keyRaw) throw new Error(`missing_${deletionKeyField}`);
  const deletionTarget = deletionTargetFromInsert('mongo', deletionKeyField, keyRaw);

  return {
    deletionKeyField,
    deletionTarget,
    collection: optionalString(body.collection) || MONGO_COLLECTION,
    doc,
  };
}

export function buildInsertRow(
  engine: DbEngine,
  input: MysqlInsertBody | PostgresInsertBody | MongoInsertBody
): MysqlPiiRow | PostgresRow | MongoDocument {
  const handle = input.deletionTarget.handle;
  if (engine === 'mysql') {
    const row = input as MysqlInsertBody;
    return {
      recordKey: handle,
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

  if (engine === 'postgres') {
    const row = input as PostgresInsertBody;
    return {
      recordKey: handle,
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

  const row = input as MongoInsertBody;
  const numericId = Math.floor(Math.random() * 80000) + 10000;
  const oid = `682b${numericId.toString(16).padStart(8, '0').slice(-8)}9f0a4c00${numericId.toString(16).padStart(5, '0').slice(-5)}`;
  return {
    recordKey: handle,
    _id: `ObjectId("${oid}")`,
    collection: row.collection ?? MONGO_COLLECTION,
    doc: row.doc,
  };
}
