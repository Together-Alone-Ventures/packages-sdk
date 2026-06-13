import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { receiptSummary } from '@together-alone/zombiedelete-core';
import {
  clearBackendPublicKeyCache,
  clearDemoApiConfigCache,
  connectDemoCanister,
  formatIssuanceAgentError,
  getActiveSignerPrincipalText,
  guardDemoRestore,
  issueDemoAttestedDeletionReceipt,
  signingModeLabel,
  syncDemoReceipt,
  type IssuanceProgress,
} from './lib/zombiedeleteConnect';
import {
  checkDeclaredDeletionViaApi,
  fetchAllEngineSnapshots,
  fetchDemoApiConfig,
  resetDemoDatabases,
  downloadDeletionCertificatePdf,
  restoreRecordViaApi,
} from './lib/demoApi';
import { loadErasureState, saveErasureState } from './lib/erasurePersistence';
import type { Receipt, RecordUiState } from './lib/types';
import { BRAND } from './config/brand';
import { CompanyLogo } from './components/CompanyLogo';
import {
  allDeletableTargetsFromSnapshot,
  deletableRecordKeys,
  deletableRecordKeysFromSnapshot,
  homeDataItems,
  type DbSnapshot,
} from './data/demoDatabases';
import type { SignedBackendDeletionAttestationV1 } from '@together-alone/zombiedelete-core';
import { PlatformDataList } from './components/PlatformDataList';
import { DatabaseViewerModal } from './components/DatabaseViewerModal';
import type { DbEngine } from './lib/dbEngine';

type RecordState = {
  ui: RecordUiState;
  receipt?: Receipt;
  offsign?: SignedBackendDeletionAttestationV1;
  lastError?: string;
};

type ErasureByEngine = Record<DbEngine, Record<string, RecordState | undefined>>;

const EMPTY_ERASURE: ErasureByEngine = { mysql: {}, postgres: {}, mongo: {} };

type LogLine = { id: number; tone: 'info' | 'ok' | 'err'; text: string };

const emptySelection = (): Record<DbEngine, string> => ({
  mysql: '',
  postgres: '',
  mongo: '',
});

const emptySnapshot = (): DbSnapshot => ({
  mysql: [],
  postgres: [],
  mongo: [],
});

export default function App() {
  const [canisterId, setCanisterId] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [canisterStatus, setCanisterStatus] = useState<string | null>(null);
  const [dbSnapshot, setDbSnapshot] = useState<DbSnapshot>(emptySnapshot);
  const [apiReady, setApiReady] = useState(false);
  const [erasureByEngine, setErasureByEngine] = useState<ErasureByEngine>(EMPTY_ERASURE);
  const [selectedByEngine, setSelectedByEngine] = useState(emptySelection);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IssuanceProgress | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [reissueMessage, setReissueMessage] = useState<string | null>(null);
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [dataEngine, setDataEngine] = useState<DbEngine>('mysql');
  const bootstrapStarted = useRef(false);

  const engineRecords = erasureByEngine[dataEngine];
  const selectedId = selectedByEngine[dataEngine];

  const logId = useMemo(() => ({ n: 0 }), []);
  const pushLog = useCallback(
    (tone: LogLine['tone'], text: string) => {
      logId.n += 1;
      setLogs((prev) => [{ id: logId.n, tone, text }, ...prev].slice(0, 12));
    },
    [logId]
  );

  const setSelectedId = (id: string) => {
    setSelectedByEngine((prev) => ({ ...prev, [dataEngine]: id }));
  };

  const applyErasureState = useCallback(
    (updater: (prev: ErasureByEngine) => ErasureByEngine) => {
      setErasureByEngine((prev) => {
        const next = updater(prev);
        const id = canisterId.trim();
        if (id) saveErasureState(id, next);
        return next;
      });
    },
    [canisterId]
  );

  const patchEngineRecord = (engine: DbEngine, recordId: string, patch: RecordState) => {
    applyErasureState((prev) => ({
      ...prev,
      [engine]: {
        ...prev[engine],
        [recordId]: { ...prev[engine][recordId], ...patch },
      },
    }));
  };

  const selectedState = selectedId ? engineRecords[selectedId] : undefined;
  const selectedUi = selectedState?.ui ?? 'active';
  const catalogKeys = deletableRecordKeys(dataEngine);
  const backendKeys = deletableRecordKeysFromSnapshot(dataEngine, dbSnapshot);
  const canEraseSelected = catalogKeys.includes(selectedId);
  const rowInBackend = backendKeys.includes(selectedId);
  const canIssueProof = canEraseSelected && rowInBackend && selectedUi !== 'deleted';
  const selectedLabel = useMemo(() => {
    const item = homeDataItems(dataEngine).find((i) => i.recordKey === selectedId);
    return item?.label ?? selectedId;
  }, [dataEngine, selectedId]);

  const refreshDbSnapshot = useCallback(async () => {
    const snapshot = await fetchAllEngineSnapshots();
    setDbSnapshot(snapshot);
    setApiReady(true);
  }, []);

  // After API reset, rows reappear in the backend — drop stale "deleted" UI for those keys.
  useEffect(() => {
    if (!apiReady) return;
    applyErasureState((prev) => {
      let changed = false;
      const next: ErasureByEngine = {
        mysql: { ...prev.mysql },
        postgres: { ...prev.postgres },
        mongo: { ...prev.mongo },
      };
      for (const engine of ['mysql', 'postgres', 'mongo'] as const) {
        for (const key of deletableRecordKeysFromSnapshot(engine, dbSnapshot)) {
          const state = next[engine][key];
          if (state?.ui === 'deleted' && !state.receipt) {
            delete next[engine][key];
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [apiReady, dbSnapshot, applyErasureState]);

  // Initial selection only — never jump away from a row the user just erased (with proof).
  useEffect(() => {
    if (!apiReady || selectedId) return;
    const pick = deletableRecordKeys(dataEngine).find(
      (key) => engineRecords[key]?.ui !== 'deleted' && backendKeys.includes(key)
    );
    if (pick) {
      setSelectedByEngine((prev) => ({ ...prev, [dataEngine]: pick }));
    }
  }, [apiReady, dataEngine, dbSnapshot, engineRecords, selectedId, backendKeys]);

  const syncRecord = async (engine: DbEngine, recordId: string) => {
    const lookup = await syncDemoReceipt(recordId);
    if (lookup.kind === 'ok' && lookup.receipt) {
      patchEngineRecord(engine, recordId, { ui: 'deleted', receipt: lookup.receipt });
    } else if (lookup.kind === 'not_yet_issued') {
      patchEngineRecord(engine, recordId, {
        ui: 'checking',
        lastError: 'Issuance in progress on-chain',
      });
    } else {
      applyErasureState((prev) => {
        const existing = prev[engine][recordId];
        if (existing?.ui === 'deleted' && existing.receipt) return prev;
        const nextEngine = { ...prev[engine] };
        delete nextEngine[recordId];
        return { ...prev, [engine]: nextEngine };
      });
    }
  };

  const syncAllReceipts = async (snapshot: DbSnapshot, persisted: ErasureByEngine | null) => {
    const seen = new Set<string>();
    const syncKey = async (engine: DbEngine, key: string) => {
      const token = `${engine}:${key}`;
      if (seen.has(token)) return;
      seen.add(token);
      await syncRecord(engine, key);
    };
    for (const engine of ['mysql', 'postgres', 'mongo'] as const) {
      for (const key of deletableRecordKeys(engine)) {
        await syncKey(engine, key);
      }
    }
    for (const { engine, key } of allDeletableTargetsFromSnapshot(snapshot)) {
      await syncKey(engine, key);
    }
    for (const engine of ['mysql', 'postgres', 'mongo'] as const) {
      for (const key of Object.keys(persisted?.[engine] ?? {})) {
        await syncKey(engine, key);
      }
    }
    pushLog('info', 'État d’effacement resynchronisé depuis le canister (données API).');
  };

  const connect = useCallback(async () => {
    const config = await fetchDemoApiConfig();
    const id = config.mktd03CanisterId?.trim() ?? canisterId.trim();
    if (!id) {
      pushLog('err', 'MKTD03_CANISTER_ID manquant dans packages-sdk/demo/api/.env');
      return;
    }
    setConnecting(true);
    setCanisterStatus(null);
    try {
      setCanisterId(id);
      const persisted = (loadErasureState(id) as ErasureByEngine | null) ?? EMPTY_ERASURE;
      setErasureByEngine(persisted);
      const snapshot = await fetchAllEngineSnapshots();
      setDbSnapshot(snapshot);
      setApiReady(true);

      const connection = await connectDemoCanister();
      setCanisterId(connection.canisterId);
      setConnected(true);
      setCanisterStatus(connection.status);
      pushLog('ok', `MKTd03 prêt via API (${connection.canisterId}, ${connection.icHost})`);
      pushLog(
        'info',
        `${signingModeLabel()} : ${getActiveSignerPrincipalText(connection.controllerPrincipal)}`
      );
      pushLog(
        'info',
        `BDD live : ${snapshot.mysql.length} MySQL · ${snapshot.postgres.length} Postgres · ${snapshot.mongo.length} Mongo`
      );
      await syncAllReceipts(snapshot, persisted);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog('err', msg);
      setConnected(false);
    } finally {
      setConnecting(false);
    }
  }, [canisterId, pushLog]);

  useEffect(() => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    void (async () => {
      try {
        await refreshDbSnapshot();
        await connect();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushLog('err', msg);
      }
    })();
  }, [connect, pushLog, refreshDbSnapshot]);

  const resetDemo = async () => {
    try {
      clearBackendPublicKeyCache();
      clearDemoApiConfigCache();
      await resetDemoDatabases();
      await refreshDbSnapshot();
      applyErasureState(() => EMPTY_ERASURE);
      setReissueMessage(null);
      pushLog('ok', 'Demo databases reset: all seed rows restored in the backend.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog('err', msg);
    }
  };

  const proveDeletion = async () => {
    if (!connected || !canIssueProof || !apiReady) return;
    setBusy(true);
    setProgress(null);
    setReissueMessage(null);
    patchEngineRecord(dataEngine, selectedId, { ui: 'checking' });
    let deleteSucceeded = false;
    try {
      pushLog('info', `DELETE + offsign + issuance via demo API (${dataEngine})…`);
      const { offsign: attestation, receipt } = await issueDemoAttestedDeletionReceipt(
        dataEngine,
        selectedId,
        setProgress,
        {
          subjectLabel: selectedLabel.replace(/\u00b7/g, ' - '),
          dataCategory: dataEngine,
          sourceSystem: BRAND.sourceSystem,
          legalContext: 'GDPR Art. 17 - demo (backend-attested declaration)',
        }
      );
      deleteSucceeded = true;
      await refreshDbSnapshot();
      pushLog('ok', `Row removed from local ${dataEngine} database and CVDR receipt issued.`);

      const dbCheck = await checkDeclaredDeletionViaApi({
        engine: dataEngine,
        recordKey: selectedId,
        signedAttestation: attestation,
        receipt,
      });
      if (dbCheck.ok) {
        pushLog('ok', 'Post-receipt DB reconciliation: declaration matches absent row.');
      } else {
        pushLog(
          'err',
          `Post-receipt DB check failed: ${dbCheck.detail ?? 'declaration vs database mismatch'}`
        );
      }

      patchEngineRecord(dataEngine, selectedId, { ui: 'deleted', receipt, offsign: attestation });
      const sum = receiptSummary(receipt);
      pushLog(
        'ok',
        `Backend-attested receipt issued for ${selectedLabel} (${dataEngine}). Tombstone ${sum.postHex}`
      );
    } catch (e) {
      let msg = formatIssuanceAgentError(null, e, canisterId);
      if (msg.includes('Audit metadata rejected')) {
        msg += [
          '',
          'Recharge la page (Cmd+Shift+R) pour prendre le correctif SDK, puis réessaie.',
        ].join(' ');
      }
      patchEngineRecord(dataEngine, selectedId, { ui: 'active', lastError: msg });
      pushLog('err', msg);
      if (deleteSucceeded) {
        try {
          await resetDemoDatabases();
          await refreshDbSnapshot();
          pushLog('info', 'Demo API rows restored after failed proof. You can retry.');
        } catch {
          // keep primary error visible
        }
      } else {
        await refreshDbSnapshot();
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const attemptRestore = async () => {
    if (!connected || !canEraseSelected) return;
    setBusy(true);
    setReissueMessage(null);
    try {
      const guardMsg = await guardDemoRestore(dataEngine, selectedId);
      if (guardMsg) {
        setReissueMessage(guardMsg);
        pushLog('info', guardMsg);
        const apiRestore = await restoreRecordViaApi(dataEngine, selectedId);
        if (!apiRestore.ok) {
          pushLog('info', `API restore also blocked: ${apiRestore.message ?? apiRestore.error}`);
        }
        return;
      }
      const apiRestore = await restoreRecordViaApi(dataEngine, selectedId);
      if (apiRestore.ok) {
        patchEngineRecord(dataEngine, selectedId, { ui: 'active' });
        await refreshDbSnapshot();
        setReissueMessage(null);
        pushLog('ok', `Row restored in ${dataEngine} database (no on-chain tombstone).`);
        return;
      }
      setReissueMessage(apiRestore.message ?? apiRestore.error ?? 'restore_failed');
      pushLog('info', `Restore not applied: ${apiRestore.message ?? apiRestore.error}`);
    } catch (e) {
      const msg = formatIssuanceAgentError(null, e, canisterId);
      setReissueMessage(msg);
      pushLog('err', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="demo-shell">
      <header className="demo-hero">
        <div className="demo-hero-inner">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-4 md:gap-5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] shadow-panel">
                <CompanyLogo className="h-9 w-9" title={BRAND.name} />
              </div>
              <div className="min-w-0">
                <p className="demo-kicker">{BRAND.demoContext}</p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-[2.5rem] md:leading-tight">
                  {BRAND.name}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{BRAND.description}</p>
                <p className="mt-3 text-sm font-medium text-zinc-300">{BRAND.tagline}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:pt-1">
              <span
                className={`demo-status ${
                  connecting ? 'demo-status--busy' : connected ? 'demo-status--ok' : 'demo-status--off'
                }`}
              >
                {connecting ? 'Connecting MKTd03…' : connected ? 'MKTd03 connected' : 'MKTd03 offline'}
              </span>
              {canisterStatus ? (
                <span className="demo-badge hidden font-mono sm:inline-flex">{canisterId.slice(0, 12)}…</span>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <section className="demo-panel lg:col-span-2">
          <PlatformDataList
            engine={dataEngine}
            onEngineChange={setDataEngine}
            snapshot={dbSnapshot}
            records={engineRecords}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onVisualize={() => setDbModalOpen(true)}
          />
        </section>

        <section className="demo-panel lg:col-span-3">
          <div className="demo-panel-header">
            <h2 className="demo-section-title">Erasure workflow</h2>
          </div>
          {canEraseSelected ? (
            <>
              <p className="text-sm text-zinc-400">
                Selected ({dataEngine}):{' '}
                <span className="font-medium text-zinc-100">{selectedLabel}</span>
              </p>

              <ol className="demo-steps">
                <Step
                  n={1}
                  title="Record exists"
                  done={selectedUi === 'deleted' || (selectedUi === 'active' && rowInBackend)}
                  active={selectedUi === 'active' && rowInBackend}
                >
                  {selectedUi === 'deleted'
                    ? 'Row removed from this store. Tombstone committed on-chain for this subject.'
                    : rowInBackend
                      ? 'Row still live in this store. Nothing tombstoned on-chain for this subject yet.'
                      : 'Row already removed from the backend database (left list is the full catalog). Pick an Active row or reset the demo DB.'}
                </Step>
                <Step
                  n={2}
                  title="Delete via API + issue receipt"
                  done={selectedUi === 'deleted'}
                  active={busy || selectedUi === 'checking'}
                >
                  {progress?.message ??
                    'DELETE via API (OffSign + DB check), preflight allowance, then backend-attested receipt on MKTd03.'}
                </Step>
                <Step
                  n={3}
                  title="Prove it cannot come back"
                  done={Boolean(reissueMessage) && selectedUi === 'deleted'}
                  active={selectedUi === 'deleted' && !reissueMessage}
                >
                  Try to issue again for the same subject. The canister rejects re-commit.
                </Step>
              </ol>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="demo-btn-primary"
                  disabled={!connected || !canIssueProof || busy}
                  onClick={() => void proveDeletion()}
                >
                  {busy ? 'Issuing receipt…' : 'Erase & issue receipt'}
                </button>
                <button
                  type="button"
                  className="demo-btn-danger"
                  disabled={!connected || busy || selectedUi !== 'deleted'}
                  onClick={() => void attemptRestore()}
                >
                  Try to restore customer data
                </button>
              </div>

              {connecting ? (
                <p className="mt-3 text-sm text-zinc-500">Connexion MKTd03 via l’API…</p>
              ) : null}
              {!connected && !connecting ? (
                <p className="mt-3 text-sm text-warn">
                  MKTd03 indisponible. Vérifiez MKTD03_CANISTER_ID dans demo/api/.env et relancez
                  l’API.
                </p>
              ) : null}
              {connected && !rowInBackend && selectedUi === 'active' ? (
                <p className="mt-3 text-sm text-zinc-500">
                  This row is not in the backend database anymore. Use <strong>Reset demo DB</strong>{' '}
                  or pick a row still live in Visualize database.
                </p>
              ) : null}

              {selectedUi === 'deleted' && selectedState?.receipt ? (
                <ReceiptCard
                  receipt={selectedState.receipt}
                  offsign={selectedState.offsign}
                  engine={dataEngine}
                  recordKey={selectedId}
                  connected={connected}
                  subjectLabel={selectedLabel}
                  onLog={pushLog}
                />
              ) : null}

              {reissueMessage ? (
                <div className="demo-alert">
                  <strong>Re-add blocked.</strong> {reissueMessage}
                </div>
              ) : null}

              {selectedState?.lastError ? (
                <p className="mt-3 text-sm text-danger">{selectedState.lastError}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-zinc-500">
              Select a demo-linked row in your platform data (MySQL, PostgreSQL, or MongoDB) to run
              the erasure workflow. Each store has its own on-chain subject.
            </p>
          )}
        </section>
      </div>

      <section className="demo-panel mt-5 lg:mt-6">
        <div className="demo-panel-header">
          <h2 className="demo-section-title">Activity log</h2>
          <button
            type="button"
            className="demo-btn-ghost px-3 py-1.5 text-xs"
            disabled={!apiReady || busy}
            onClick={() => void resetDemo()}
          >
            Reset demo DB
          </button>
        </div>
        {canisterStatus ? (
          <p className="demo-meta text-accent/90">
            MKTd03 · {canisterId || '…'} · {canisterStatus}
          </p>
        ) : null}
        <ul className="demo-log">
          {logs.length === 0 ? (
            <li className="demo-log-line--info">
              {connecting ? 'Initialisation…' : 'En attente de l’API demo.'}
            </li>
          ) : (
            logs.map((line) => (
              <li
                key={line.id}
                className={
                  line.tone === 'ok'
                    ? 'demo-log-line--ok'
                    : line.tone === 'err'
                      ? 'demo-log-line--err'
                      : 'demo-log-line--info'
                }
              >
                {line.text}
              </li>
            ))
          )}
        </ul>
      </section>

      <p className="demo-footer-note">{BRAND.poweredBy}</p>

      <DatabaseViewerModal
        open={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
        snapshot={dbSnapshot}
        engine={dataEngine}
        onEngineChange={setDataEngine}
        removedCount={Object.values(engineRecords).filter((s) => s?.ui === 'deleted').length}
      />
    </div>
  );
}

function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: ReactNode;
}) {
  const stateClass = active ? 'demo-step--active' : done ? 'demo-step--done' : 'demo-step--muted';

  return (
    <li className={`demo-step ${stateClass}`}>
      <span className="demo-step-index">{n}</span>
      <div>
        <div className="demo-step-title">{title}</div>
        <p className="demo-step-copy">{children}</p>
      </div>
    </li>
  );
}

function ReceiptCard({
  receipt,
  offsign,
  engine,
  recordKey,
  connected,
  subjectLabel,
  onLog,
}: {
  receipt: Receipt;
  offsign?: SignedBackendDeletionAttestationV1;
  engine: DbEngine;
  recordKey: string;
  connected: boolean;
  subjectLabel: string;
  onLog: (tone: LogLine['tone'], text: string) => void;
}) {
  const sum = receiptSummary(receipt);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const downloadPdf = async () => {
    setPdfBusy(true);
    setPdfError(null);
    try {
      const blob = await downloadDeletionCertificatePdf({
        engine,
        recordKey,
        receipt,
        signedAttestation: offsign,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deletion-certificate-${recordKey.replace(/[^a-zA-Z0-9._-]+/g, '_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onLog('ok', `PDF certificate downloaded for ${subjectLabel}.`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPdfError(msg);
      onLog('err', msg);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="demo-receipt">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-semibold text-success">Deletion receipt on file</p>
        <button
          type="button"
          className="demo-btn-ghost px-3 py-1.5 text-xs"
          disabled={!connected || pdfBusy}
          onClick={() => void downloadPdf()}
        >
          {pdfBusy ? 'Generating PDF…' : 'Download PDF certificate'}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1.5 font-mono text-[11px]">
        <dt className="text-zinc-500">subject</dt>
        <dd className="break-all text-zinc-200">{sum.subjectHex}</dd>
        <dt className="text-zinc-500">pre-state</dt>
        <dd className="break-all text-zinc-200">{sum.preHex}</dd>
        <dt className="text-zinc-500">post-state</dt>
        <dd className="break-all text-zinc-200">{sum.postHex}</dd>
        <dt className="text-zinc-500">proof</dt>
        <dd className="text-zinc-200">{sum.proofLen > 0 ? `${sum.proofLen} bytes` : 'n/a'}</dd>
      </dl>
      {!connected ? (
        <p className="mt-2 text-zinc-500">MKTd03 requis pour le certificat PDF via votre API.</p>
      ) : null}
      {pdfError ? <p className="mt-3 text-danger">{pdfError}</p> : null}
    </div>
  );
}