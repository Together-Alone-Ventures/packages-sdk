import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(apiRoot, '.env') });
import { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  attestDeletionProof,
  issueAttestedDeletionReceipt,
  issueDeletionCertificate,
  offsign,
  queryMktd03Receipt,
  queryMktd03Status,
} from '@together-alone/zombiedelete-server';
import { serializeReceiptForJson, sha256 } from '@together-alone/zombiedelete-core';
import cors from 'cors';
import express from 'express';
import { DEMO_COMPANY } from '../../shared/company.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import {
  demoSkipMktd03Preflight,
  demoStorageMode,
  requireMktd03CanisterId,
  resolveMktd03CanisterId,
} from './config.js';
import { seedRealDatabases } from './db/seed.js';
import { deleteRecord, listRecords, resetAll, restoreRecord, storageMode } from './store.js';
import {
  clearDeletionRegistry,
  getCachedOffsign,
  isRegisteredForRestore,
  registerDeletion,
} from './deletionRegistry.js';
import { isMktd03InterfaceError, mktd03CanisterHint } from './mktd03CanisterGuard.js';
import { wiredDeletionTarget } from './verifyDeletion.js';

const DEMO_SUBJECT_PREFIX = DEMO_COMPANY.subjectPrefix;
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

function loadControllerIdentity(): Ed25519KeyIdentity {
  const fromEnv = process.env.MKTD03_CONTROLLER_IDENTITY_JSON?.trim();
  if (fromEnv) {
    return Ed25519KeyIdentity.fromJSON(fromEnv);
  }
  const identityPath = path.join(sharedDir, 'local-dev-ic-identity.json');
  if (!fs.existsSync(identityPath)) {
    throw new Error('mktd03_controller_identity_missing');
  }
  return Ed25519KeyIdentity.fromJSON(fs.readFileSync(identityPath, 'utf8'));
}

function resolveMktd03IcHost(): string {
  return (process.env.MKTD03_IC_HOST?.trim() || 'http://127.0.0.1:4943').replace(/\/$/, '');
}

function loadAuditorHmacKeyHex(): string {
  const fromEnv = process.env.MKTD03_AUDITOR_HMAC_KEY_HEX?.trim();
  if (fromEnv) return fromEnv;
  const keyPath = path.join(sharedDir, 'local-dev-auditor-hmac-key.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error('mktd03_auditor_hmac_key_missing');
  }
  const json = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as { hex?: string };
  const hex = json.hex?.trim();
  if (!hex) throw new Error('mktd03_auditor_hmac_key_invalid');
  return hex;
}

async function subjectReferenceForRecord(recordKey: string): Promise<Uint8Array> {
  return sha256(`${DEMO_SUBJECT_PREFIX}${recordKey}`);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

function parseEngine(value: string): DbEngine | null {
  if (value === 'mysql' || value === 'postgres' || value === 'mongo') return value;
  return null;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'offsign-demo-api', storageMode: storageMode() });
});

app.get('/api/config', (_req, res) => {
  const mktd03CanisterId = resolveMktd03CanisterId();
  res.json({
    ok: true,
    backendPublicKeyHex,
    subjectPrefix: DEMO_SUBJECT_PREFIX,
    storageMode: storageMode(),
    mktd03CanisterId,
    icHost: resolveMktd03IcHost(),
    skipMktd03Preflight: demoSkipMktd03Preflight(),
  });
});

app.get('/api/:engine/records', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  try {
    const records = await listRecords(engine);
    res.json({ ok: true, engine, records });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ ok: false, error: 'database_unavailable', message });
  }
});

app.delete('/api/:engine/records/:recordKey', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  const recordKey = decodeURIComponent(req.params.recordKey);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  const deleted = await deleteRecord(engine, recordKey);
  if (!deleted) {
    res.status(404).json({ ok: false, error: 'not_found' });
    return;
  }

  const subjectReference = await sha256(`${DEMO_SUBJECT_PREFIX}${recordKey}`);
  const subjectReferenceHex = Buffer.from(subjectReference).toString('hex');
  const wired = wiredDeletionTarget(engine, recordKey);

  const offsignPayload = await offsign({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    deletedAtUnixMs: Date.now(),
    sourceSystem: DEMO_COMPANY.sourceSystemApi,
    sourceLocator: `${engine}/${recordKey}`,
    connection: wired.connection,
    databaseType: wired.databaseType,
    tableOrCollection: wired.tableOrCollection,
    data: wired.data,
  });

  registerDeletion(engine, recordKey, subjectReferenceHex, offsignPayload);

  res.json({
    ok: true,
    engine,
    recordKey,
    offsign: offsignPayload,
    goneproof: offsignPayload,
    backendPublicKeyHex,
  });
});

app.post('/api/:engine/records/:recordKey/prove-deletion', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  const recordKey = decodeURIComponent(req.params.recordKey);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  let canisterId: string;
  try {
    canisterId = requireMktd03CanisterId(String(req.body?.canisterId ?? ''));
  } catch {
    res.status(503).json({
      ok: false,
      error: 'mktd03_canister_id_not_configured',
      message: 'Définis MKTD03_CANISTER_ID dans packages-sdk/demo/api/.env',
    });
    return;
  }

  const deleted = await deleteRecord(engine, recordKey);
  if (!deleted) {
    res.status(404).json({
      ok: false,
      error: 'not_found',
      message:
        'Cette ligne n’existe plus dans la BDD. Réinitialisez (Reset demo DB) ou choisissez une ligne encore présente dans Visualize database.',
    });
    return;
  }

  const subjectReference = await subjectReferenceForRecord(recordKey);
  const subjectReferenceHex = Buffer.from(subjectReference).toString('hex');
  const wired = wiredDeletionTarget(engine, recordKey);

  const offsignPayload = await offsign({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    deletedAtUnixMs: Date.now(),
    sourceSystem: DEMO_COMPANY.sourceSystemApi,
    sourceLocator: `${engine}/${recordKey}`,
    connection: wired.connection,
    databaseType: wired.databaseType,
    tableOrCollection: wired.tableOrCollection,
    data: wired.data,
  });

  registerDeletion(engine, recordKey, subjectReferenceHex, offsignPayload);

  const skipPreflight =
    Boolean(req.body?.skipPreflight) || demoSkipMktd03Preflight();

  try {
    const controllerIdentity = loadControllerIdentity();
    const receipt = await issueAttestedDeletionReceipt({
      canisterId,
      icHost: resolveMktd03IcHost(),
      controllerIdentity,
      signedAttestation: offsignPayload,
      trustedBackendPublicKeyHex: backendPublicKeyHex,
      skipPreflight,
      audit: req.body?.audit,
    });

    res.json({
      ok: true,
      engine,
      recordKey,
      offsign: offsignPayload,
      receipt: serializeReceiptForJson(receipt),
      backendPublicKeyHex,
      controllerPrincipal: controllerIdentity.getPrincipal().toText(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = isMktd03InterfaceError(error) ? mktd03CanisterHint(canisterId) : undefined;
    res.status(502).json({
      ok: false,
      error: isMktd03InterfaceError(error) ? 'not_mktd03_canister' : 'issuance_failed',
      message: hint ? `${hint}\n\n${message}` : message,
      offsign: offsignPayload,
    });
  }
});

app.get('/api/mktd03/status', async (req, res) => {
  const canisterId = resolveMktd03CanisterId(String(req.query.canisterId ?? ''));
  if (!canisterId) {
    res.status(503).json({
      ok: false,
      error: 'mktd03_canister_id_not_configured',
      message: 'Définis MKTD03_CANISTER_ID dans packages-sdk/demo/api/.env',
    });
    return;
  }
  try {
    const status = await queryMktd03Status(canisterId, resolveMktd03IcHost());
    const controllerIdentity = loadControllerIdentity();
    res.json({
      ok: true,
      status,
      icHost: resolveMktd03IcHost(),
      controllerPrincipal: controllerIdentity.getPrincipal().toText(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMktd03InterfaceError(error)) {
      res.status(400).json({
        ok: false,
        error: 'not_mktd03_canister',
        message: mktd03CanisterHint(canisterId),
        detail: message,
      });
      return;
    }
    res.status(502).json({ ok: false, error: 'status_failed', message });
  }
});

app.get('/api/mktd03/receipt', async (req, res) => {
  const canisterId = resolveMktd03CanisterId(String(req.query.canisterId ?? ''));
  const recordKey = String(req.query.recordKey ?? '').trim();
  if (!canisterId) {
    res.status(503).json({ ok: false, error: 'mktd03_canister_id_not_configured' });
    return;
  }
  if (!recordKey) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  try {
    const subjectReference = await subjectReferenceForRecord(recordKey);
    const lookup = await queryMktd03Receipt(canisterId, resolveMktd03IcHost(), subjectReference);
    res.json({
      ok: true,
      lookup:
        lookup.kind === 'ok' && lookup.receipt
          ? { ...lookup, receipt: serializeReceiptForJson(lookup.receipt) }
          : lookup,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'receipt_lookup_failed', message });
  }
});

app.get('/api/mktd03/restore-guard', async (req, res) => {
  const canisterId = resolveMktd03CanisterId(String(req.query.canisterId ?? ''));
  const recordKey = String(req.query.recordKey ?? '').trim();
  const engine = parseEngine(String(req.query.engine ?? ''));
  if (!canisterId) {
    res.status(503).json({ ok: false, error: 'mktd03_canister_id_not_configured' });
    return;
  }
  if (!recordKey || !engine) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  if (isRegisteredForRestore(engine, recordKey)) {
    res.json({
      ok: true,
      allowed: false,
      reason: 'local_deletion_registry',
      message:
        'Restore blocked: row was deleted via OffSign and may be tombstoned on MKTd03.',
    });
    return;
  }
  try {
    const subjectReference = await subjectReferenceForRecord(recordKey);
    const lookup = await queryMktd03Receipt(canisterId, resolveMktd03IcHost(), subjectReference);
    if (lookup.kind === 'ok') {
      res.json({
        ok: true,
        allowed: false,
        reason: 'tombstoned_on_chain',
        receipt: serializeReceiptForJson(lookup.receipt),
      });
      return;
    }
    res.json({ ok: true, allowed: true, receiptLookup: lookup.kind });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'restore_guard_failed', message });
  }
});

app.post('/api/check-declared-deletion', async (req, res) => {
  const { signedAttestation, engine, recordKey, receipt } = req.body as {
    signedAttestation?: Parameters<typeof attestDeletionProof>[0]['signedAttestation'];
    engine?: DbEngine;
    recordKey?: string;
    receipt?: Parameters<typeof attestDeletionProof>[0]['receipt'];
  };
  if (!signedAttestation || !engine || !recordKey || !receipt) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  if (!parseEngine(engine)) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }

  const wired = wiredDeletionTarget(engine, recordKey);
  const result = await attestDeletionProof({
    signedAttestation,
    receipt,
    trustedBackendPublicKeyHex: backendPublicKeyHex,
    connection: wired.connection,
    databaseType: wired.databaseType,
    tableOrCollection: wired.tableOrCollection,
    data: wired.data,
  });
  res.json({ ok: true, check: result });
});

app.post('/api/:engine/records/:recordKey/deletion-certificate', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  const recordKey = decodeURIComponent(req.params.recordKey);
  const body = req.body as {
    signedAttestation?: Parameters<typeof issueDeletionCertificate>[0]['signedAttestation'];
    receipt?: Parameters<typeof issueDeletionCertificate>[0]['receipt'];
  };
  const receiptRaw = body.receipt;
  const signedAttestation =
    body.signedAttestation ?? (engine ? getCachedOffsign(engine, recordKey) : undefined);
  if (!engine || !recordKey || !signedAttestation || !receiptRaw) {
    res.status(400).json({
      ok: false,
      error: 'missing_fields',
      message: !signedAttestation
        ? 'Attestation backend introuvable. Réémettez le receipt (Prove deletion) pendant que l’API tourne.'
        : 'receipt requis',
    });
    return;
  }
  const receipt = serializeReceiptForJson(receiptRaw) as Parameters<
    typeof issueDeletionCertificate
  >[0]['receipt'];
  let canisterId: string;
  try {
    canisterId = requireMktd03CanisterId();
  } catch {
    res.status(503).json({ ok: false, error: 'mktd03_canister_id_not_configured' });
    return;
  }
  const wired = wiredDeletionTarget(engine, recordKey);
  try {
    const { pdf } = await issueDeletionCertificate({
      canisterId,
      icHost: resolveMktd03IcHost(),
      auditorHmacKeyHex: loadAuditorHmacKeyHex(),
      signedAttestation,
      receipt,
      trustedBackendPublicKeyHex: backendPublicKeyHex,
      connection: wired.connection,
      databaseType: wired.databaseType,
      tableOrCollection: wired.tableOrCollection,
      data: wired.data,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="deletion-certificate-${recordKey.replace(/[^a-zA-Z0-9._-]+/g, '_')}.pdf"`
    );
    res.send(Buffer.from(pdf));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'deletion_certificate_failed', message });
  }
});

app.post('/api/:engine/records/:recordKey/restore', async (req, res) => {
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
  const restored = await restoreRecord(engine, recordKey);
  if (!restored) {
    res.status(404).json({ ok: false, error: 'not_restorable' });
    return;
  }
  res.json({ ok: true, engine, recordKey });
});

app.post('/api/reset', async (_req, res) => {
  try {
    await resetAll();
    clearDeletionRegistry();
    res.json({ ok: true, storageMode: storageMode() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ ok: false, error: 'reset_failed', message });
  }
});

async function bootstrap(): Promise<void> {
  if (demoStorageMode() === 'real') {
    const autoSeed = process.env.DEMO_DB_AUTO_SEED?.trim().toLowerCase();
    if (autoSeed === '1' || autoSeed === 'true' || autoSeed === 'yes') {
      const counts = await seedRealDatabases();
      console.log(`Real DB seeded: mysql=${counts.mysql} postgres=${counts.postgres} mongo=${counts.mongo}`);
    } else {
      console.log('DEMO_STORAGE_MODE=real — run `npm run db:seed` if tables are empty.');
    }
  }

  app.listen(PORT, () => {
    console.log(`OffSign demo API http://127.0.0.1:${PORT} (storage: ${storageMode()})`);
    console.log(`Backend attestation public key: ${backendPublicKeyHex}`);
  });
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
