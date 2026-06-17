import { guardRestoreAgainstMktd03, queryMktd03Receipt } from '@together-alone/zombiedelete-server';
import {
  serializeReceiptForJson,
  type Receipt,
  type RestoreGuardResult,
} from '@together-alone/zombiedelete-core';
import type { DbEngine } from '../../shared/dbEngine.js';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import { subjectReferenceForHandle } from '../../shared/deletionSubject.js';
import { requireMktd03CanisterId, resolveMktd03CanisterId } from './config.js';
import { wiredDeletionTargetFromDeletionTarget, type WiredDeletionTarget } from './verifyDeletion.js';

function resolveMktd03IcHost(): string {
  return (process.env.MKTD03_IC_HOST?.trim() || 'https://icp-api.io').replace(/\/$/, '');
}

export async function subjectReferenceForDeletionHandle(handle: string): Promise<Uint8Array> {
  return subjectReferenceForHandle(handle);
}

/** @deprecated Use subjectReferenceForDeletionHandle */
export async function subjectReferenceForRecord(handle: string): Promise<Uint8Array> {
  return subjectReferenceForDeletionHandle(handle);
}

export type InsertGuardResult =
  | (RestoreGuardResult & { wired: WiredDeletionTarget })
  | {
      allowed: false;
      reason: 'local_deletion_registry';
      subjectReferenceHex: string;
      wired: WiredDeletionTarget;
      receipt?: Receipt;
    };

export async function guardInsertAgainstCvdr(
  engine: DbEngine,
  target: DeletionTarget,
  canisterIdOverride?: string
): Promise<InsertGuardResult> {
  const wired = wiredDeletionTargetFromDeletionTarget(target);
  const subjectReference = await subjectReferenceForHandle(target.handle);
  const subjectReferenceHex = Buffer.from(subjectReference).toString('hex');

  const canisterId = resolveMktd03CanisterId(canisterIdOverride);
  if (!canisterId) {
    return { allowed: true, receiptLookup: 'not_found', wired };
  }

  const guard = await guardRestoreAgainstMktd03({
    subjectReference,
    client: {
      getReceipt: (ref) => queryMktd03Receipt(requireMktd03CanisterId(canisterId), resolveMktd03IcHost(), ref),
    },
    policy: { failClosedOnLookupError: false },
  });

  return { ...guard, wired };
}

export function insertBlockedMessage(
  engine: DbEngine,
  guard: InsertGuardResult
): string {
  const table = guard.wired.tableOrCollection;
  if (!guard.allowed && guard.reason === 'tombstoned_on_chain') {
    return `Insert blocked: subject tombstoned on MKTd03 for ${engine}/${table}.`;
  }
  if (!guard.allowed && guard.reason === 'local_deletion_registry') {
    return `Insert blocked: record was previously destroyed via OffSign on ${engine}/${table}.`;
  }
  return 'Insert blocked.';
}

export function serializeGuardReceipt(guard: InsertGuardResult): unknown | undefined {
  if (!guard.allowed && 'receipt' in guard && guard.receipt) {
    return serializeReceiptForJson(guard.receipt);
  }
  return undefined;
}
