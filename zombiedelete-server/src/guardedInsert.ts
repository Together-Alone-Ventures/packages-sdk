import type { RestoreGuardPolicy, RestoreGuardResult } from '@together-alone/zombiedelete-core';
import type { WiredDeletionDatabaseType } from '@together-alone/zombiedelete-core';
import {
  executeParameterizedInsert,
  type SqlColumnValues,
} from './databaseMutations.js';
import {
  guardRestoreAgainstMktd03,
  type RestoreGuardClient,
} from './restoreGuard.js';

export class OffsignInsertBlockedError extends Error {
  readonly guard: RestoreGuardResult & { allowed: false };

  constructor(guard: RestoreGuardResult & { allowed: false }) {
    super('Insert blocked by CVDR restore guard');
    this.name = 'OffsignInsertBlockedError';
    this.guard = guard;
  }
}

export type GuardedInsertInput = {
  connection: unknown;
  databaseType: WiredDeletionDatabaseType;
  tableOrCollection: string;
  subjectReference: Uint8Array;
  /** SQL engines — column names validated, values parameterized. */
  columns?: SqlColumnValues;
  /** MongoDB — top-level keys validated. */
  document?: Record<string, unknown>;
  client: RestoreGuardClient;
  localRegistry?: (subjectReferenceHex: string) => Promise<boolean>;
  policy?: RestoreGuardPolicy;
  /** @deprecated Prefer `policy.failClosedOnLookupError`. */
  failClosedOnLookupError?: boolean;
};

export type GuardedInsertResult = {
  insertedCount: number;
  receiptLookup: Extract<RestoreGuardResult, { allowed: true }>['receiptLookup'];
};

/**
 * Orchestrated INSERT: CVDR restore guard first, then parameterized insert.
 * Refuses when the subject is tombstoned on-chain or in a local deletion registry.
 */
export async function guardedInsert(input: GuardedInsertInput): Promise<GuardedInsertResult> {
  const guard = await guardRestoreAgainstMktd03({
    subjectReference: input.subjectReference,
    client: input.client,
    localRegistry: input.localRegistry,
    policy: input.policy,
    failClosedOnLookupError: input.failClosedOnLookupError,
  });

  if (!guard.allowed) {
    throw new OffsignInsertBlockedError(guard);
  }

  const { insertedCount } = await executeParameterizedInsert({
    connection: input.connection,
    databaseType: input.databaseType,
    tableOrCollection: input.tableOrCollection,
    columns: input.columns,
    document: input.document,
  });

  return {
    insertedCount,
    receiptLookup: guard.receiptLookup,
  };
}
