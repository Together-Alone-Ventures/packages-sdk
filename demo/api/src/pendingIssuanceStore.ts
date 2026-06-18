import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  PendingIssuanceRecord,
  PendingIssuanceStore,
} from '@together-alone/zombiedelete-server';

const STORE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.mktd03-pending-issuance.json');

type StoreFile = {
  records: PendingIssuanceRecord[];
};

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: StoreFile): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

export const demoPendingIssuanceStore: PendingIssuanceStore = {
  async save(record) {
    const store = await readStore();
    const next = store.records.filter(
      (entry) =>
        !(
          entry.canisterId === record.canisterId &&
          entry.subjectReferenceHex === record.subjectReferenceHex
        )
    );
    next.push(record);
    await writeStore({ records: next });
  },
  async load(canisterId, subjectReferenceHex) {
    const store = await readStore();
    return (
      store.records.find(
        (entry) =>
          entry.canisterId === canisterId &&
          entry.subjectReferenceHex === subjectReferenceHex.toLowerCase()
      ) ?? null
    );
  },
  async clear(canisterId, subjectReferenceHex) {
    const store = await readStore();
    const next = store.records.filter(
      (entry) =>
        !(
          entry.canisterId === canisterId &&
          entry.subjectReferenceHex === subjectReferenceHex.toLowerCase()
        )
    );
    await writeStore({ records: next });
  },
  async list(canisterId) {
    const store = await readStore();
    return store.records.filter((entry) => entry.canisterId === canisterId);
  },
};

export function pendingIssuanceStorePath(): string {
  return STORE_PATH;
}
