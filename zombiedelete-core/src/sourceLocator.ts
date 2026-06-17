/** Inputs for a human-auditable deletion locator (stored on the attestation). */
export type DeletionSourceLocatorInput = {
  databaseType: string;
  /** SQL table or MongoDB collection where the row/document lived. */
  tableOrCollection: string;
  /** Stable record identifier (often the primary key or demo recordKey). */
  recordKey: string;
};

/**
 * Canonical OffSign source locator: `{engine}/{tableOrCollection}/{recordKey}`.
 * Use on every `offsign()` call so auditors know exactly which table/collection was cleared.
 */
export function formatDeletionSourceLocator(input: DeletionSourceLocatorInput): string {
  const table = input.tableOrCollection.trim();
  const key = input.recordKey.trim();
  const engine = input.databaseType.trim();
  if (!engine || !table || !key) {
    throw new Error(
      'formatDeletionSourceLocator requires databaseType, tableOrCollection, and recordKey'
    );
  }
  return `${engine}/${table}/${key}`;
}
