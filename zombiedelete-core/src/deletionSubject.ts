import { sha256 } from './protocol.js';

export type DeriveDeletionSubjectReferenceParams = {
  /** Tenant / app prefix baked into every subject (e.g. meridian-demo:) */
  subjectPrefix: string;
  databaseType: string;
  tableOrCollection: string;
  keyField: string;
  keyValue: string;
  /** Optional normalizer — default: trim + lowercase */
  normalize?: (raw: string) => string;
};

function slugifySegment(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function encodeHandleValue(normalized: string): string {
  return slugifySegment(normalized.replace(/@/g, '-at-'));
}

/**
 * Canonical on-chain subject from a pre-built handle:
 * `{prefix}{engine}/{table}/{keyField}/{encodedValue}`.
 */
export async function deriveDeletionSubjectReferenceFromHandle(
  subjectPrefix: string,
  handle: string
): Promise<Uint8Array> {
  return sha256(`${subjectPrefix}${handle}`);
}

/**
 * Build handle then hash — same result as `deriveDeletionSubjectReferenceFromHandle`
 * when the handle is built with the same encoding rules.
 */
export async function deriveDeletionSubjectReference(
  params: DeriveDeletionSubjectReferenceParams
): Promise<Uint8Array> {
  const handle = buildDeletionHandle(params);
  return deriveDeletionSubjectReferenceFromHandle(params.subjectPrefix, handle);
}

/** Human/audit handle (URL-safe encoded value segment). */
export function buildDeletionHandle(
  params: Omit<DeriveDeletionSubjectReferenceParams, 'subjectPrefix'>
): string {
  const normalize = params.normalize ?? ((v) => v.trim().toLowerCase());
  const keyValue = normalize(params.keyValue);
  if (!keyValue) throw new Error('empty_deletion_key_value');
  return `${params.databaseType}/${params.tableOrCollection}/${params.keyField}/${encodeHandleValue(keyValue)}`;
}
