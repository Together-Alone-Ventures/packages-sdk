import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  checkDeclaredDeletionInDatabase,
  offsign,
  sha256,
} from '@together-alone/zombiedelete-server';
import cors from 'cors';
import express from 'express';
import type { DbEngine } from '../../shared/dbEngine.js';
import { deleteRecord, listRecords, resetAll, restoreRecord } from './store.js';
import {
  clearDeletionRegistry,
  isRegisteredForRestore,
  registerDeletion,
} from './deletionRegistry.js';
import { createDemoWiredConnection } from './verifyDeletion.js';

const DEMO_SUBJECT_PREFIX = 'infoshare-demo:';
const PORT = Number(process.env.DEMO_API_PORT ?? 8787);
const sharedDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shared');

function loadBackendIdentity(): Ed25519KeyIdentity {
  const identityPath = path.join(sharedDir, 'local-dev-backend-identity.json');
  if (!fs.existsSync(identityPath)) {
    const identity = Ed25519KeyIdentity.generate();
    fs.writeFileSync(identityPath, JSON.stringify(identity.toJSON()));
    return identity;
  }
  return Ed25519KeyIdentity.fromJSON(fs.readFileSync(identityPath, 'utf8'));
}

const backendIdentity = loadBackendIdentity();
const backendPublicKeyHex = Buffer.from(backendIdentity.getPublicKey().toRaw()).toString('hex');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function parseEngine(value: string): DbEngine | null {
  if (value === 'mysql' || value === 'postgres' || value === 'mongo') return value;
  return null;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'offsign-demo-api' });
});

app.get('/api/config', (_req, res) => {
  res.json({
    ok: true,
    backendPublicKeyHex,
    subjectPrefix: DEMO_SUBJECT_PREFIX,
  });
});

app.get('/api/:engine/records', (req, res) => {
  const engine = parseEngine(req.params.engine);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  res.json({ ok: true, engine, records: listRecords(engine) });
});

app.delete('/api/:engine/records/:recordKey', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  const recordKey = decodeURIComponent(req.params.recordKey);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  const deleted = deleteRecord(engine, recordKey);
  if (!deleted) {
    res.status(404).json({ ok: false, error: 'not_found' });
    return;
  }

  const subjectReference = await sha256(`${DEMO_SUBJECT_PREFIX}${recordKey}`);
  const subjectReferenceHex = Buffer.from(subjectReference).toString('hex');
  const deletedAtUnixMs = Date.now();

  const offsignPayload = await offsign({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    deletedAtUnixMs,
    sourceSystem: 'Infoshare booth demo API',
    sourceLocator: `${engine}/${recordKey}`,
    connection: createDemoWiredConnection(engine, recordKey),
    databaseType: engine,
    tableOrCollection: `${engine}_records`,
    data: { keyField: 'record_key', keyValue: recordKey },
  });

  registerDeletion(engine, recordKey, subjectReferenceHex);

  res.json({
    ok: true,
    engine,
    recordKey,
    offsign: offsignPayload,
    /** @deprecated use `offsign` */
    goneproof: offsignPayload,
    backendPublicKeyHex,
  });
});

app.post('/api/check-declared-deletion', async (req, res) => {
  const { signedAttestation, engine, recordKey, receipt } = req.body as {
    signedAttestation?: Parameters<typeof checkDeclaredDeletionInDatabase>[0]['signedAttestation'];
    engine?: DbEngine;
    recordKey?: string;
    receipt?: Parameters<typeof checkDeclaredDeletionInDatabase>[0]['receipt'];
  };
  if (!signedAttestation || !engine || !recordKey) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  if (!parseEngine(engine)) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }

  const result = await checkDeclaredDeletionInDatabase({
    signedAttestation,
    receipt,
    trustedBackendPublicKeyHex: backendPublicKeyHex,
    connection: createDemoWiredConnection(engine, recordKey),
    databaseType: engine,
    tableOrCollection: `${engine}_records`,
    data: { keyField: 'record_key', keyValue: recordKey },
  });
  res.json({ ok: true, check: result });
});

app.post('/api/:engine/records/:recordKey/restore', (req, res) => {
  const engine = parseEngine(req.params.engine);
  const recordKey = decodeURIComponent(req.params.recordKey);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  if (isRegisteredForRestore(engine, recordKey)) {
    res.status(409).json({
      ok: false,
      error: 'restore_blocked',
      reason: 'subject_deleted_and_registered',
      message:
        'Restore blocked: row was deleted via OffSign and may be tombstoned on MKTd03. Use guardRestoreAgainstMktd03 before any INSERT.',
    });
    return;
  }
  const restored = restoreRecord(engine, recordKey);
  if (!restored) {
    res.status(404).json({ ok: false, error: 'not_restorable' });
    return;
  }
  res.json({ ok: true, engine, recordKey });
});

app.post('/api/reset', (_req, res) => {
  resetAll();
  clearDeletionRegistry();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`OffSign demo API http://127.0.0.1:${PORT}`);
  console.log(`Backend attestation public key: ${backendPublicKeyHex}`);
});
