import { deriveDeletionSubjectReferenceFromHandle } from '@together-alone/zombiedelete-core';
import type { DbEngine } from './dbEngine.js';
import type { MongoDocument, MysqlPiiRow, PostgresRow } from './demoDatabases.js';
import { DEMO_COMPANY } from './company.js';

export type DeletionKeyConfig = {
  keyField: string;
  label: string;
  normalize: (raw: string) => string;
};

export type DeletionTarget = {
  engine: DbEngine;
  tableOrCollection: string;
  keyField: string;
  keyValue: string;
  handle: string;
};

export const DEMO_TABLES = {
  mysql: 'customer_pii',
  postgres: 'customer_contacts',
  mongo: 'demo_documents',
} as const satisfies Record<DbEngine, string>;

/** Per-engine default destruction key — overridable on insert. */
export const DEFAULT_DELETION_KEYS: Record<DbEngine, DeletionKeyConfig> = {
  mysql: {
    keyField: 'email',
    label: 'email',
    normalize: (v) => v.trim().toLowerCase(),
  },
  postgres: {
    keyField: 'contact_email',
    label: 'contact_email',
    normalize: (v) => v.trim().toLowerCase(),
  },
  mongo: {
    keyField: 'email',
    label: 'doc.email',
    normalize: (v) => v.trim().toLowerCase(),
  },
};

export const DELETION_KEY_OPTIONS: Record<DbEngine, DeletionKeyConfig[]> = {
  mysql: [
    DEFAULT_DELETION_KEYS.mysql,
    { keyField: 'id', label: 'id', normalize: (v) => String(v).trim() },
    { keyField: 'full_name', label: 'full_name', normalize: (v) => v.trim().toLowerCase() },
  ],
  postgres: [
    DEFAULT_DELETION_KEYS.postgres,
    { keyField: 'id', label: 'id', normalize: (v) => String(v).trim() },
    { keyField: 'contact_name', label: 'contact_name', normalize: (v) => v.trim().toLowerCase() },
  ],
  mongo: [
    DEFAULT_DELETION_KEYS.mongo,
    { keyField: 'title', label: 'doc.title', normalize: (v) => v.trim().toLowerCase() },
  ],
};

export function tableForEngine(engine: DbEngine): string {
  return DEMO_TABLES[engine];
}

function slugifySegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

export function encodeHandleValue(normalized: string): string {
  return slugifySegment(normalized.replace(/@/g, '-at-'));
}

export function buildDeletionHandle(
  engine: DbEngine,
  tableOrCollection: string,
  keyField: string,
  rawValue: string,
  normalize: (v: string) => string = (v) => v.trim().toLowerCase()
): string {
  const keyValue = normalize(rawValue);
  if (!keyValue) throw new Error('empty_deletion_key_value');
  return `${engine}/${tableOrCollection}/${keyField}/${encodeHandleValue(keyValue)}`;
}

export function subjectReferenceMaterial(handle: string): string {
  return `${DEMO_COMPANY.subjectPrefix}${handle}`;
}

export function subjectReferenceForHandle(handle: string): Promise<Uint8Array> {
  return deriveDeletionSubjectReferenceFromHandle(DEMO_COMPANY.subjectPrefix, handle);
}

export function extractKeyValueFromRow(
  engine: DbEngine,
  row: MysqlPiiRow | PostgresRow | MongoDocument,
  keyField: string
): string | null {
  if (engine === 'mysql') {
    const r = row as MysqlPiiRow;
    const v = (r as Record<string, unknown>)[keyField];
    return v != null ? String(v) : null;
  }
  if (engine === 'postgres') {
    const r = row as PostgresRow;
    const v = (r as Record<string, unknown>)[keyField];
    return v != null ? String(v) : null;
  }
  const doc = (row as MongoDocument).doc;
  if (keyField === 'email') {
    if (typeof doc.email === 'string') return doc.email;
    if (doc.contact && typeof doc.contact === 'object') {
      const email = (doc.contact as { email?: string }).email;
      if (typeof email === 'string') return email;
    }
    return null;
  }
  if (keyField === 'title' && typeof doc.title === 'string') return doc.title;
  const v = doc[keyField];
  return v != null ? String(v) : null;
}

export function deletionTargetForRow(
  engine: DbEngine,
  row: MysqlPiiRow | PostgresRow | MongoDocument,
  keyField?: string
): DeletionTarget | null {
  const configs = keyField
    ? [deletionKeyConfig(engine, keyField)]
    : DELETION_KEY_OPTIONS[engine];
  const tableOrCollection = tableForEngine(engine);

  for (const config of configs) {
    const raw = extractKeyValueFromRow(engine, row, config.keyField);
    if (!raw || raw === 'n/a') continue;
    const keyValue = config.normalize(raw);
    return {
      engine,
      tableOrCollection,
      keyField: config.keyField,
      keyValue,
      handle: buildDeletionHandle(engine, tableOrCollection, config.keyField, raw, config.normalize),
    };
  }
  return null;
}

export function deletionHandleForRow(
  engine: DbEngine,
  row: MysqlPiiRow | PostgresRow | MongoDocument,
  keyField?: string
): string | null {
  return deletionTargetForRow(engine, row, keyField)?.handle ?? null;
}

export function parseDeletionHandle(handle: string): {
  engine: DbEngine;
  tableOrCollection: string;
  keyField: string;
  encodedValue: string;
} | null {
  const parts = handle.split('/');
  if (parts.length !== 4) return null;
  const [engine, tableOrCollection, keyField, encodedValue] = parts;
  if (engine !== 'mysql' && engine !== 'postgres' && engine !== 'mongo') return null;
  if (!tableOrCollection || !keyField || !encodedValue) return null;
  return { engine, tableOrCollection, keyField, encodedValue };
}

export function deletionKeyConfig(engine: DbEngine, keyField?: string): DeletionKeyConfig {
  if (keyField) {
    const found = DELETION_KEY_OPTIONS[engine].find((k) => k.keyField === keyField);
    if (found) return found;
  }
  return DEFAULT_DELETION_KEYS[engine];
}

export function buildDeletionHandleFromParts(
  engine: DbEngine,
  keyField: string,
  rawValue: string
): string {
  const config = deletionKeyConfig(engine, keyField);
  return buildDeletionHandle(
    engine,
    tableForEngine(engine),
    config.keyField,
    rawValue,
    config.normalize
  );
}

export function deletionTargetFromInsert(
  engine: DbEngine,
  keyField: string,
  rawValue: string
): DeletionTarget {
  const config = deletionKeyConfig(engine, keyField);
  const tableOrCollection = tableForEngine(engine);
  const keyValue = config.normalize(rawValue);
  return {
    engine,
    tableOrCollection,
    keyField: config.keyField,
    keyValue,
    handle: buildDeletionHandleFromParts(engine, keyField, rawValue),
  };
}

export function previewDeletionHandleFromForm(
  engine: DbEngine,
  values: Record<string, string>
): string | null {
  try {
    const keyField = values.deletionKeyField?.trim() || DEFAULT_DELETION_KEYS[engine].keyField;
    if (engine === 'mongo') {
      const doc = JSON.parse(values.docJson || '{}') as Record<string, unknown>;
      const config = deletionKeyConfig(engine, keyField);
      let raw: string | null = null;
      if (config.keyField === 'email') {
        raw =
          (typeof doc.email === 'string' ? doc.email : undefined) ??
          (doc.contact &&
          typeof doc.contact === 'object' &&
          typeof (doc.contact as { email?: string }).email === 'string'
            ? (doc.contact as { email: string }).email
            : undefined) ??
          null;
      } else if (config.keyField === 'title' && typeof doc.title === 'string') {
        raw = doc.title;
      } else if (doc[config.keyField] != null) {
        raw = String(doc[config.keyField]);
      }
      if (!raw) return null;
      return buildDeletionHandleFromParts(engine, keyField, raw);
    }
    const raw = values[keyField];
    if (!raw?.trim()) return null;
    return buildDeletionHandleFromParts(engine, keyField, raw);
  } catch {
    return null;
  }
}
