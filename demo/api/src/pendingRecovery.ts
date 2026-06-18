import {
  queryMktd03Allowance,
  queryMktd03Receipt,
  recoverMktd03PendingIssuance,
} from '@together-alone/zombiedelete-server';
import type { Ed25519KeyIdentity } from '@dfinity/identity';
import { MYSQL_ROWS, POSTGRES_ROWS, MONGO_DOCUMENTS } from '../../shared/demoDatabases.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import {
  deletionHandleForRow,
  subjectReferenceForHandle,
} from '../../shared/deletionSubject.js';
import { demoPendingIssuanceStore } from './pendingIssuanceStore.js';

export type PendingOnChainSubject = {
  handle: string;
  label: string;
  engine: DbEngine;
  subjectReferenceHex: string;
  localPendingIdHex: string | null;
};

export async function listPendingOnChainSubjects(
  canisterId: string,
  icHost: string
): Promise<PendingOnChainSubject[]> {
  const pending: PendingOnChainSubject[] = [];
  const localRecords = await demoPendingIssuanceStore.list(canisterId);

  async function scan(
    engine: DbEngine,
    rows: Array<{
      recordKey?: string;
      full_name?: string;
      contact_name?: string;
      doc?: Record<string, unknown>;
    }>
  ) {
    for (const row of rows) {
      const handle = deletionHandleForRow(engine, row as never);
      if (!handle) continue;
      const subjectReference = await subjectReferenceForHandle(handle);
      const lookup = await queryMktd03Receipt(canisterId, icHost, subjectReference);
      if (lookup.kind !== 'not_yet_issued') continue;
      const subjectReferenceHex = Buffer.from(subjectReference).toString('hex');
      const saved = localRecords.find(
        (entry) => entry.subjectReferenceHex === subjectReferenceHex
      );
      const label =
        engine === 'mysql'
          ? `${(row as { full_name?: string }).full_name}`
          : engine === 'postgres'
            ? `${(row as { contact_name?: string }).contact_name}`
            : `${typeof row.doc?.title === 'string' ? row.doc.title : row.recordKey}`;
      pending.push({
        handle,
        label,
        engine,
        subjectReferenceHex,
        localPendingIdHex: saved?.pendingIdHex ?? null,
      });
    }
  }

  await scan('mysql', MYSQL_ROWS);
  await scan('postgres', POSTGRES_ROWS);
  await scan('mongo', MONGO_DOCUMENTS);
  return pending;
}

export async function recoverStoredPendingIssuances(params: {
  canisterId: string;
  icHost: string;
  controllerIdentity: Ed25519KeyIdentity;
}): Promise<
  Array<
    | { handle: string; subjectReferenceHex: string; ok: true }
    | { handle: string; subjectReferenceHex: string; ok: false; error: string }
  >
> {
  const pendingOnChain = await listPendingOnChainSubjects(params.canisterId, params.icHost);
  const results: Array<
    | { handle: string; subjectReferenceHex: string; ok: true }
    | { handle: string; subjectReferenceHex: string; ok: false; error: string }
  > = [];

  for (const subject of pendingOnChain) {
    if (!subject.localPendingIdHex) {
      results.push({
        handle: subject.handle,
        subjectReferenceHex: subject.subjectReferenceHex,
        ok: false,
        error: 'no_local_pending_id',
      });
      continue;
    }
    try {
      const subjectReference = await subjectReferenceForHandle(subject.handle);
      await recoverMktd03PendingIssuance({
        canisterId: params.canisterId,
        icHost: params.icHost,
        controllerIdentity: params.controllerIdentity,
        subjectReference,
        pendingIdHex: subject.localPendingIdHex,
        pendingIssuanceStore: demoPendingIssuanceStore,
      });
      results.push({
        handle: subject.handle,
        subjectReferenceHex: subject.subjectReferenceHex,
        ok: true,
      });
    } catch (error) {
      results.push({
        handle: subject.handle,
        subjectReferenceHex: subject.subjectReferenceHex,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

export async function mktd03PendingSummary(canisterId: string, icHost: string) {
  const allowance = await queryMktd03Allowance(canisterId, icHost);
  const pendingOnChain = await listPendingOnChainSubjects(canisterId, icHost);
  const localRecords = await demoPendingIssuanceStore.list(canisterId);
  return {
    allowance,
    pendingOnChain,
    localPendingRecords: localRecords,
  };
}
