import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(apiRoot, '.env') });
import { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  attestDeletionProof,
  issueDeletionCertificate,
  queryMktd03Allowance,
  queryMktd03InterfaceVersion,
  queryMktd03Receipt,
  queryMktd03Status,
  recoverMktd03PendingIssuance,
} from '@together-alone/zombiedelete-server';
import { serializeReceiptForJson, formatDeletionSourceLocator } from '@together-alone/zombiedelete-core';
import cors from 'cors';
import express from 'express';
import { DEMO_COMPANY } from '../../shared/company.js';
import { DEMO_SCENARIOS } from '../../shared/demoScenarios.js';
import type { DbEngine } from '../../shared/dbEngine.js';
import {
  demoSkipMktd03Preflight,
  demoStorageMode,
  requireMktd03CanisterId,
  resolveMktd03CanisterId,
  demoInitialAllowance,
  MKTD03_COMMERCIAL_INTERFACE,
} from './config.js';
import { seedRealDatabases } from './db/seed.js';
import { listRecords, resetAll, restoreRecordByHandle, resolveTargetFromHandle, rowExistsForTarget, storageMode } from './store.js';
import {
  clearDeletionRegistry,
  countRegisteredDeletions,
  getCachedOffsign,
  getRegisteredTarget,
  registerDeletion,
} from './deletionRegistry.js';
import { mktd03PendingSummary, recoverStoredPendingIssuances } from './pendingRecovery.js';
import { demoPendingIssuanceStore } from './pendingIssuanceStore.js';
import { isMktd03InterfaceError, isAllowanceStatusMissing, mktd03CanisterHint } from './mktd03CanisterGuard.js';
import { wiredDeletionTargetFromDeletionTarget } from './verifyDeletion.js';
import {
  resolveDeletionTarget,
  sourceLocatorKeyForTarget,
} from './deletionResolve.js';
import {
  getCurrentScenarioId,
  parseScenarioId,
  setCurrentScenarioId,
} from './scenarioState.js';
import { buildInsertRow, resolveInsertBody } from './buildInsertRow.js';
import {
  guardInsertAgainstCvdr,
  insertBlockedMessage,
  serializeGuardReceipt,
  subjectReferenceForRecord,
} from './insertGuard.js';
import { orchestratedDelete, orchestratedInsert } from './demoOrchestration.js';
import { subjectReferenceForHandle } from '../../shared/deletionSubject.js';
import { MONGO_COLLECTION, MYSQL_TABLE, POSTGRES_TABLE } from './config.js';

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

const signing = {
  offsignIdentity: backendIdentity,
  controllerIdentity: loadControllerIdentity(),
  offsignPublicKeyHex: backendPublicKeyHex,
};

function loadControllerIdentity(): Ed25519KeyIdentity {
  const fromEnv = process.env.MKTD03_CONTROLLER_IDENTITY_JSON?.trim();
  if (fromEnv && (fromEnv.startsWith('{') || fromEnv.startsWith('['))) {
    return Ed25519KeyIdentity.fromJSON(fromEnv);
  }
  if (fromEnv) {
    console.warn(
      'MKTD03_CONTROLLER_IDENTITY_JSON must be Ed25519 JSON — ' +
        'using shared/local-dev-ic-identity.json instead'
    );
  }
  const identityPath = path.join(sharedDir, 'local-dev-ic-identity.json');
  if (!fs.existsSync(identityPath)) {
    throw new Error('mktd03_controller_identity_missing');
  }
  return Ed25519KeyIdentity.fromJSON(fs.readFileSync(identityPath, 'utf8'));
}

function resolveMktd03IcHost(): string {
  return (process.env.MKTD03_IC_HOST?.trim() || 'https://icp-api.io').replace(/\/$/, '');
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

async function deletionSourceLocator(
  engine: DbEngine,
  handle: string
): Promise<string> {
  const target = await resolveDeletionTarget(engine, handle);
  if (!target) throw new Error('deletion_target_not_found');
  const wired = wiredDeletionTargetFromDeletionTarget(target);
  return formatDeletionSourceLocator({
    databaseType: wired.databaseType,
    tableOrCollection: wired.tableOrCollection,
    recordKey: sourceLocatorKeyForTarget(target),
  });
}

function tableForEngine(engine: DbEngine): string {
  if (engine === 'mysql') return MYSQL_TABLE;
  if (engine === 'postgres') return POSTGRES_TABLE;
  return MONGO_COLLECTION;
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
    backendPublicKeyHex: signing.offsignPublicKeyHex,
    subjectPrefix: DEMO_SUBJECT_PREFIX,
    storageMode: storageMode(),
    mktd03CanisterId,
    icHost: resolveMktd03IcHost(),
    skipMktd03Preflight: demoSkipMktd03Preflight(),
    scenarioId: getCurrentScenarioId(),
    scenarios: DEMO_SCENARIOS.map((s) => ({
      id: s.id,
      label: s.label,
      eyebrow: s.eyebrow,
      subtitle: s.subtitle,
    })),
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

app.post('/api/:engine/records', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }

  let parsed;
  try {
    const existing = await listRecords(engine);
    parsed = await resolveInsertBody(engine, req.body as Record<string, unknown>, existing);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_body';
    res.status(400).json({
      ok: false,
      error: code,
      message: 'All table columns are required — see the insert form fields.',
    });
    return;
  }

  const deletionHandle = parsed.deletionTarget.handle;

  try {
    const subjectReference = await subjectReferenceForHandle(deletionHandle);
    const existing = await rowExistsForTarget(engine, parsed.deletionTarget);
    if (existing) {
      res.status(409).json({
        ok: false,
        error: 'already_exists',
        message: `A row with the same destruction subject already exists in ${engine}/${tableForEngine(engine)}.`,
        tableOrCollection: tableForEngine(engine),
        deletionHandle,
      });
      return;
    }

    const row = buildInsertRow(engine, parsed);
    const insertResult = await orchestratedInsert({
      engine,
      parsed,
      row,
      subjectReference,
    });

    if (!insertResult.ok) {
      const guard = {
        allowed: false as const,
        reason: insertResult.guard.reason,
        subjectReferenceHex: insertResult.guard.subjectReferenceHex,
        receipt: 'receipt' in insertResult.guard ? insertResult.guard.receipt : undefined,
        wired: wiredDeletionTargetFromDeletionTarget(parsed.deletionTarget),
      };
      res.status(409).json({
        ok: false,
        error: 'insert_blocked',
        reason: guard.reason,
        message: insertBlockedMessage(engine, guard),
        engine,
        recordKey: deletionHandle,
        deletionHandle,
        tableOrCollection: tableForEngine(engine),
        receipt: serializeGuardReceipt(guard),
      });
      return;
    }

    res.status(201).json({
      ok: true,
      engine,
      recordKey: deletionHandle,
      deletionHandle,
      tableOrCollection: tableForEngine(engine),
      record: row,
      assignedId: engine === 'mysql' ? (parsed as { id: number }).id : (parsed as { id?: string }).id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'insert_failed', message });
  }
});

app.delete('/api/:engine/records/:recordKey', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  const deletionHandle = decodeURIComponent(req.params.recordKey);
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
      message: 'Set MKTD03_CANISTER_ID in packages-sdk/demo/api/.env',
    });
    return;
  }

  const target = await resolveDeletionTarget(engine, deletionHandle);
  if (!target) {
    res.status(404).json({
      ok: false,
      error: 'not_found',
      message:
        'This row is no longer in the database. Reset the demo DB or pick a row still present in Visualize database.',
    });
    return;
  }

  try {
    const subjectReference = await subjectReferenceForRecord(deletionHandle);
    const subjectReferenceHex = Buffer.from(subjectReference).toString('hex');
    const skipPreflight =
      Boolean(req.body?.skipPreflight) || demoSkipMktd03Preflight();
    const { signedAttestation: offsignPayload, receipt } = await orchestratedDelete({
      engine,
      target,
      identity: signing.offsignIdentity,
      subjectReference,
      deletionEventId: crypto.randomUUID(),
      sourceSystem: DEMO_COMPANY.sourceSystemApi,
      sourceLocator: await deletionSourceLocator(engine, deletionHandle),
      canisterId,
      icHost: resolveMktd03IcHost(),
      controllerIdentity: signing.controllerIdentity,
      trustedBackendPublicKeyHex: signing.offsignPublicKeyHex,
      skipPreflight,
      audit: req.body?.audit,
    });

    registerDeletion(
      engine,
      deletionHandle,
      subjectReferenceHex,
      offsignPayload,
      target,
      canisterId
    );

    res.json({
      ok: true,
      engine,
      recordKey: deletionHandle,
      deletionHandle,
      tableOrCollection: tableForEngine(engine),
      offsign: offsignPayload,
      goneproof: offsignPayload,
      receipt: serializeReceiptForJson(receipt),
      backendPublicKeyHex: signing.offsignPublicKeyHex,
      controllerPrincipal: signing.controllerIdentity.getPrincipal().toText(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint = isMktd03InterfaceError(error) ? mktd03CanisterHint(canisterId) : undefined;
    if (!isMktd03InterfaceError(error)) {
      res.status(404).json({
        ok: false,
        error: 'not_found',
        message:
          message ||
          'This row is no longer in the database. Reset the demo DB or pick a row still present in Visualize database.',
      });
      return;
    }
    res.status(502).json({
      ok: false,
      error: 'issuance_failed',
      message: hint ? `${hint}

${message}` : message,
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

app.get('/api/mktd03/allowance', async (req, res) => {
  const canisterId = resolveMktd03CanisterId(String(req.query.canisterId ?? ''));
  if (!canisterId) {
    res.status(503).json({ ok: false, error: 'mktd03_canister_id_not_configured' });
    return;
  }
  try {
    const allowance = await queryMktd03Allowance(canisterId, resolveMktd03IcHost());
    res.json({ ok: true, allowance: { ...allowance, source: 'on_chain' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const allowanceMissing =
      isMktd03InterfaceError(error) ||
      message.includes('get_allowance_status') ||
      isAllowanceStatusMissing(error);
    if (allowanceMissing) {
      let interfaceVersion: string | undefined;
      try {
        interfaceVersion = await queryMktd03InterfaceVersion(canisterId, resolveMktd03IcHost());
      } catch {
        // ignore — status probe optional
      }
      const initial = demoInitialAllowance();
      if (initial != null) {
        const used = countRegisteredDeletions(canisterId);
        const available = Math.max(0, initial - used);
        res.json({
          ok: true,
          allowance: {
            remaining: String(initial),
            reserved: '0',
            available: String(available),
            commercialStatus: 'demo_estimate',
            canEmit: available > 0,
            source: 'demo_estimate',
            used: String(used),
            interfaceVersion,
          },
        });
        return;
      }
      res.status(503).json({
        ok: false,
        error: 'commercial_interface_missing',
        interfaceVersion,
        requiredInterface: MKTD03_COMMERCIAL_INTERFACE,
        message:
          `Ce canister MKTd03${interfaceVersion ? ` (interface ${interfaceVersion})` : ''} n'expose pas get_allowance_status. ` +
          `Upgrade vers MKTd03 ${MKTD03_COMMERCIAL_INTERFACE}+ avec la couche commercial activée à l'init, ` +
          'puis réinjecte les crédits (portail TAV / inject_allowance).',
        detail: message,
        hint: mktd03CanisterHint(canisterId),
      });
      return;
    }
    res.status(502).json({ ok: false, error: 'allowance_failed', message });
  }
});

app.get('/api/mktd03/pending', async (req, res) => {
  const canisterId = resolveMktd03CanisterId(String(req.query.canisterId ?? ''));
  if (!canisterId) {
    res.status(503).json({ ok: false, error: 'mktd03_canister_id_not_configured' });
    return;
  }
  try {
    const summary = await mktd03PendingSummary(canisterId, resolveMktd03IcHost());
    res.json({ ok: true, canisterId, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'pending_status_failed', message });
  }
});

app.post('/api/mktd03/recover-pending', async (req, res) => {
  const canisterId = resolveMktd03CanisterId(String(req.body?.canisterId ?? ''));
  if (!canisterId) {
    res.status(503).json({ ok: false, error: 'mktd03_canister_id_not_configured' });
    return;
  }
  const pendingIdHex = String(req.body?.pendingIdHex ?? '').trim();
  const recordKey = String(req.body?.recordKey ?? req.body?.deletionHandle ?? '').trim();

  try {
    if (pendingIdHex && recordKey) {
      const subjectReference = await subjectReferenceForRecord(recordKey);
      const receipt = await recoverMktd03PendingIssuance({
        canisterId,
        icHost: resolveMktd03IcHost(),
        controllerIdentity: signing.controllerIdentity,
        subjectReference,
        pendingIdHex,
        pendingIssuanceStore: demoPendingIssuanceStore,
      });
      res.json({
        ok: true,
        recordKey,
        receipt: serializeReceiptForJson(receipt),
      });
      return;
    }

    const results = await recoverStoredPendingIssuances({
      canisterId,
      icHost: resolveMktd03IcHost(),
      controllerIdentity: signing.controllerIdentity,
    });
    res.json({ ok: true, canisterId, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'recover_pending_failed', message });
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
  const deletionHandle = String(req.query.recordKey ?? req.query.deletionHandle ?? '').trim();
  const engine = parseEngine(String(req.query.engine ?? ''));
  if (!deletionHandle || !engine) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  try {
    const target =
      (await resolveDeletionTarget(engine, deletionHandle)) ??
      getRegisteredTarget(engine, deletionHandle);
    if (!target) {
      res.status(404).json({ ok: false, error: 'not_found' });
      return;
    }
    const guard = await guardInsertAgainstCvdr(engine, target, canisterId ?? undefined);
    if (!guard.allowed) {
      res.json({
        ok: true,
        allowed: false,
        reason: guard.reason,
        message: insertBlockedMessage(engine, guard),
        tableOrCollection: guard.wired.tableOrCollection,
        receipt: serializeGuardReceipt(guard),
      });
      return;
    }
    res.json({
      ok: true,
      allowed: true,
      tableOrCollection: guard.wired.tableOrCollection,
      receiptLookup: 'receiptLookup' in guard ? guard.receiptLookup : 'not_found',
    });
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
    deletionHandle?: string;
    receipt?: Parameters<typeof attestDeletionProof>[0]['receipt'];
  };
  const deletionHandle = (recordKey ?? req.body?.deletionHandle ?? '').trim();
  if (!signedAttestation || !engine || !deletionHandle || !receipt) {
    res.status(400).json({ ok: false, error: 'missing_fields' });
    return;
  }
  if (!parseEngine(engine)) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }

  const target =
    (await resolveDeletionTarget(engine, deletionHandle)) ??
    getRegisteredTarget(engine, deletionHandle);
  if (!target) {
    res.status(404).json({ ok: false, error: 'not_found' });
    return;
  }
  const wired = wiredDeletionTargetFromDeletionTarget(target);
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
  const deletionHandle = decodeURIComponent(req.params.recordKey);
  const body = req.body as {
    signedAttestation?: Parameters<typeof issueDeletionCertificate>[0]['signedAttestation'];
    receipt?: Parameters<typeof issueDeletionCertificate>[0]['receipt'];
  };
  const receiptRaw = body.receipt;
  const signedAttestation =
    body.signedAttestation ?? (engine ? getCachedOffsign(engine, deletionHandle) : undefined);
  if (!engine || !deletionHandle || !signedAttestation || !receiptRaw) {
    res.status(400).json({
      ok: false,
      error: 'missing_fields',
      message: !signedAttestation
        ? 'Backend attestation not found. Re-issue the receipt (Destroy & issue CVDR) while the API is running.'
        : 'receipt required',
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
  const target =
    (await resolveDeletionTarget(engine, deletionHandle)) ??
    getRegisteredTarget(engine, deletionHandle);
  if (!target) {
    res.status(404).json({ ok: false, error: 'not_found' });
    return;
  }
  const wired = wiredDeletionTargetFromDeletionTarget(target);
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
      `attachment; filename="deletion-certificate-${deletionHandle.replace(/[^a-zA-Z0-9._-]+/g, '_')}.pdf"`
    );
    res.send(Buffer.from(pdf));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'deletion_certificate_failed', message });
  }
});

app.post('/api/:engine/records/:recordKey/restore', async (req, res) => {
  const engine = parseEngine(req.params.engine);
  const deletionHandle = decodeURIComponent(req.params.recordKey);
  if (!engine) {
    res.status(400).json({ ok: false, error: 'invalid_engine' });
    return;
  }
  try {
    const target = await resolveTargetFromHandle(engine, deletionHandle);
    if (!target) {
      res.status(404).json({ ok: false, error: 'not_restorable' });
      return;
    }
    const guard = await guardInsertAgainstCvdr(engine, target);
    if (!guard.allowed) {
      res.status(409).json({
        ok: false,
        error: 'restore_blocked',
        reason: guard.reason,
        message: insertBlockedMessage(engine, guard),
        tableOrCollection: guard.wired.tableOrCollection,
        receipt: serializeGuardReceipt(guard),
      });
      return;
    }
    const restored = await restoreRecordByHandle(engine, deletionHandle);
    if (!restored) {
      res.status(404).json({ ok: false, error: 'not_restorable' });
      return;
    }
    res.json({
      ok: true,
      engine,
      recordKey: deletionHandle,
      deletionHandle,
      tableOrCollection: guard.wired.tableOrCollection,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(502).json({ ok: false, error: 'restore_failed', message });
  }
});

app.post('/api/reset', async (_req, res) => {
  try {
    await resetAll();
    clearDeletionRegistry(resolveMktd03CanisterId() ?? undefined);
    res.json({ ok: true, storageMode: storageMode(), scenarioId: getCurrentScenarioId() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ ok: false, error: 'reset_failed', message });
  }
});

app.get('/api/scenario', (_req, res) => {
  res.json({ ok: true, scenarioId: getCurrentScenarioId() });
});

app.post('/api/scenario', async (req, res) => {
  const scenarioId = parseScenarioId(req.body?.scenarioId);
  if (!scenarioId) {
    res.status(400).json({ ok: false, error: 'invalid_scenario' });
    return;
  }
  try {
    setCurrentScenarioId(scenarioId);
    await resetAll();
    clearDeletionRegistry(resolveMktd03CanisterId() ?? undefined);
    res.json({ ok: true, scenarioId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(503).json({ ok: false, error: 'scenario_switch_failed', message });
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
