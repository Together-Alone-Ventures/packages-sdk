import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  buildGoneproofDeletePayload,
  sha256,
} from '@together-alone/zombiedelete-server';
import cors from 'cors';
import express from 'express';
import type { DbEngine } from '../../shared/dbEngine.js';
import { deleteRecord, listRecords, resetAll } from './store.js';

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
  res.json({ ok: true, service: 'goneproof-demo-api' });
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
  const deletedAtUnixMs = Date.now();
  const goneproof = await buildGoneproofDeletePayload({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    deletedAtUnixMs,
    sourceSystem: 'Infoshare booth demo API',
    dbEngine: engine,
  });

  res.json({
    ok: true,
    engine,
    recordKey,
    goneproof,
    backendPublicKeyHex,
  });
});

app.post('/api/reset', (_req, res) => {
  resetAll();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Goneproof demo API http://127.0.0.1:${PORT}`);
  console.log(`Backend attestation public key: ${backendPublicKeyHex}`);
});
