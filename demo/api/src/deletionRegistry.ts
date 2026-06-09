import type { DbEngine } from '../../shared/dbEngine.js';

const byEngineKey = new Set<string>();
const bySubjectHex = new Set<string>();

function engineKey(engine: DbEngine, recordKey: string): string {
  return `${engine}:${recordKey}`;
}

export function registerDeletion(
  engine: DbEngine,
  recordKey: string,
  subjectReferenceHex: string
): void {
  byEngineKey.add(engineKey(engine, recordKey));
  bySubjectHex.add(subjectReferenceHex.toLowerCase());
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
}
