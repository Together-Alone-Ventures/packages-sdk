import 'dotenv/config';
import { queryMktd03Receipt } from '@together-alone/zombiedelete-server';
import { MYSQL_ROWS, POSTGRES_ROWS, MONGO_DOCUMENTS } from '../../shared/demoDatabases.js';
import {
  deletionHandleForRow,
  subjectReferenceForHandle,
} from '../../shared/deletionSubject.js';
import { resolveMktd03CanisterId } from '../src/config.js';

const canisterId = resolveMktd03CanisterId();
const icHost = process.env.MKTD03_IC_HOST?.trim() || 'https://icp-api.io';
if (!canisterId) {
  console.error('MKTD03_CANISTER_ID missing');
  process.exit(1);
}

const pendingSubjects: Array<{ handle: string; label: string }> = [];
const issued: Array<{ handle: string; label: string }> = [];

async function scan(
  engine: 'mysql' | 'postgres' | 'mongo',
  rows: Array<{ recordKey?: string; full_name?: string; contact_name?: string; doc?: Record<string, unknown> }>
) {
  for (const row of rows) {
    const handle = deletionHandleForRow(engine, row as never);
    if (!handle) continue;
    const subject = await subjectReferenceForHandle(handle);
    const lookup = await queryMktd03Receipt(canisterId, icHost, subject);
    const label =
      engine === 'mysql'
        ? `${(row as { full_name?: string }).full_name} (${handle})`
        : engine === 'postgres'
          ? `${(row as { contact_name?: string }).contact_name} (${handle})`
          : `${typeof row.doc?.title === 'string' ? row.doc.title : row.recordKey} (${handle})`;
    if (lookup.kind === 'not_yet_issued') pendingSubjects.push({ handle, label });
    if (lookup.kind === 'ok') issued.push({ handle, label });
  }
}

await scan('mysql', MYSQL_ROWS);
await scan('postgres', POSTGRES_ROWS);
await scan('mongo', MONGO_DOCUMENTS);

console.log('canister:', canisterId);
console.log('Pending (not_yet_issued):', pendingSubjects.length ? pendingSubjects : 'none in seed catalog');
console.log('Issued tombstones:', issued.length ? issued : 'none in seed catalog');
