import type { DbEngine } from '@demo-shared/dbEngine';
import type { Receipt } from './types';

export type PersistedRecordState = {
  ui: string;
  receipt?: Receipt;
  lastError?: string;
};

export type PersistedErasureByEngine = Record<
  DbEngine,
  Record<string, PersistedRecordState | undefined>
>;

const STORAGE_PREFIX = 'goneproof-demo-erasure-v1:';

function storageKey(canisterId: string): string {
  return `${STORAGE_PREFIX}${canisterId.trim()}`;
}

export function loadErasureState(canisterId: string): PersistedErasureByEngine | null {
  const id = canisterId.trim();
  if (!id) return null;
  try {
    const raw = localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedErasureByEngine;
    if (!parsed.mysql || !parsed.postgres || !parsed.mongo) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveErasureState(canisterId: string, state: PersistedErasureByEngine): void {
  const id = canisterId.trim();
  if (!id) return;
  try {
    localStorage.setItem(storageKey(id), JSON.stringify(state));
  } catch {
    // quota / private mode — ignore
  }
}

export function clearErasureState(canisterId: string): void {
  const id = canisterId.trim();
  if (!id) return;
  try {
    localStorage.removeItem(storageKey(id));
  } catch {
    // ignore
  }
}
