import type { SignedBackendDeletionAttestationV1 } from '@together-alone/zombiedelete-core';
import type { DbEngine } from '../../shared/dbEngine.js';

const byEngineKey = new Set<string>();
const bySubjectHex = new Set<string>();
const offsignByEngineKey = new Map<string, SignedBackendDeletionAttestationV1>();

function engineKey(engine: DbEngine, recordKey: string): string {
  return `${engine}:${recordKey}`;
}

export function registerDeletion(
  engine: DbEngine,
  recordKey: string,
  subjectReferenceHex: string,
  offsign?: SignedBackendDeletionAttestationV1
): void {
  const key = engineKey(engine, recordKey);
  byEngineKey.add(key);
  bySubjectHex.add(subjectReferenceHex.toLowerCase());
  if (offsign) {
    offsignByEngineKey.set(key, offsign);
  }
}

export function getCachedOffsign(
  engine: DbEngine,
  recordKey: string
): SignedBackendDeletionAttestationV1 | undefined {
  return offsignByEngineKey.get(engineKey(engine, recordKey));
}

export function isRegisteredForRestore(engine: DbEngine, recordKey: string): boolean {
  return byEngineKey.has(engineKey(engine, recordKey));
}

export function isSubjectRegistered(subjectReferenceHex: string): boolean {
  return bySubjectHex.has(subjectReferenceHex.toLowerCase());
}

export function clearDeletionRegistry(): void {
  byEngineKey.clear();
  bySubjectHex.clear();
  offsignByEngineKey.clear();
}
