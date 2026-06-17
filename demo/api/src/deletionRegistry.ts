import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SignedBackendDeletionAttestationV1 } from '@together-alone/zombiedelete-core';
import type { DbEngine } from '../../shared/dbEngine.js';
import type { DeletionTarget } from '../../shared/deletionSubject.js';
import { resolveMktd03CanisterId } from './config.js';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_FILE = path.join(apiRoot, '.demo-deletion-registry.json');

const byEngineKey = new Set<string>();
const bySubjectHex = new Set<string>();
const offsignByEngineKey = new Map<string, SignedBackendDeletionAttestationV1>();
const targetByEngineKey = new Map<string, DeletionTarget>();
/** Persisted CVDR issuance count per MKTd03 canister (demo_estimate allowance). */
const deletionsByCanister = new Map<string, Set<string>>();

type PersistedRegistryFile = {
  deletionsByCanister?: Record<string, string[]>;
};

function engineKey(engine: DbEngine, deletionHandle: string): string {
  return `${engine}:${deletionHandle}`;
}

function loadRegistryFromDisk(): void {
  try {
    if (!fs.existsSync(REGISTRY_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')) as PersistedRegistryFile;
    for (const [canisterId, keys] of Object.entries(raw.deletionsByCanister ?? {})) {
      deletionsByCanister.set(canisterId, new Set(keys));
      for (const key of keys) {
        byEngineKey.add(key);
      }
    }
  } catch {
    // corrupt file — start fresh
  }
}

function saveRegistryToDisk(): void {
  try {
    const payload: Record<string, string[]> = {};
    for (const [canisterId, keys] of deletionsByCanister.entries()) {
      payload[canisterId] = [...keys];
    }
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ deletionsByCanister: payload }, null, 2));
  } catch {
    // ignore quota / permissions
  }
}

loadRegistryFromDisk();

export function registerDeletion(
  engine: DbEngine,
  deletionHandle: string,
  subjectReferenceHex: string,
  offsign?: SignedBackendDeletionAttestationV1,
  target?: DeletionTarget,
  canisterId?: string
): void {
  const key = engineKey(engine, deletionHandle);
  byEngineKey.add(key);
  bySubjectHex.add(subjectReferenceHex.toLowerCase());
  if (offsign) {
    offsignByEngineKey.set(key, offsign);
  }
  if (target) {
    targetByEngineKey.set(key, target);
  }

  const cid = canisterId?.trim() || resolveMktd03CanisterId();
  if (cid) {
    let set = deletionsByCanister.get(cid);
    if (!set) {
      set = new Set();
      deletionsByCanister.set(cid, set);
    }
    set.add(key);
    saveRegistryToDisk();
  }
}

export function getCachedOffsign(
  engine: DbEngine,
  deletionHandle: string
): SignedBackendDeletionAttestationV1 | undefined {
  return offsignByEngineKey.get(engineKey(engine, deletionHandle));
}

export function getRegisteredTarget(
  engine: DbEngine,
  deletionHandle: string
): DeletionTarget | undefined {
  return targetByEngineKey.get(engineKey(engine, deletionHandle));
}

export function isRegisteredForRestore(engine: DbEngine, deletionHandle: string): boolean {
  return byEngineKey.has(engineKey(engine, deletionHandle));
}

export function isSubjectRegistered(subjectReferenceHex: string): boolean {
  return bySubjectHex.has(subjectReferenceHex.toLowerCase());
}

export function countRegisteredDeletions(canisterId?: string): number {
  const cid = canisterId?.trim() || resolveMktd03CanisterId();
  if (cid && deletionsByCanister.has(cid)) {
    return deletionsByCanister.get(cid)!.size;
  }
  return byEngineKey.size;
}

export function clearDeletionRegistry(canisterId?: string): void {
  if (canisterId?.trim()) {
    const cid = canisterId.trim();
    const keys = deletionsByCanister.get(cid);
    if (keys) {
      for (const key of keys) {
        byEngineKey.delete(key);
        offsignByEngineKey.delete(key);
        targetByEngineKey.delete(key);
      }
      deletionsByCanister.delete(cid);
    }
  } else {
    byEngineKey.clear();
    bySubjectHex.clear();
    offsignByEngineKey.clear();
    targetByEngineKey.clear();
    deletionsByCanister.clear();
  }
  saveRegistryToDisk();
}
