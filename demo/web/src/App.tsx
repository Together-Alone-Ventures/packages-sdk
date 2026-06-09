import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ZombieDeleteClient } from '@together-alone/zombiedelete';
import {
  clearBackendPublicKeyCache,
  clearSignerSession,
  connectDemoClient,
  demoSubjectReference,
  formatIssuanceAgentError,
  getActiveSignerPrincipalText,
  getIcHost,
  guardDemoRestore,
  issueDemoAttestedDeletionReceipt,
  receiptSummary,
  signingModeLabel,
  tryReissueDemoDeletion,
  type IssuanceProgress,
} from './lib/zombiedeleteConnect';
import { deleteRecordViaApi, checkDeclaredDeletionViaApi, fetchAllEngineSnapshots, resetDemoDatabases, restoreRecordViaApi } from './lib/demoApi';
import { loadErasureState, saveErasureState } from './lib/erasurePersistence';
import type { Receipt, RecordUiState } from './lib/types';
import { BRAND } from './config/brand';
import infoshareLogo from './assets/images/infoshare-logo.webp';
import {
  allDeletableTargets,
  deletableRecordKeys,
  deletableRecordKeysFromSnapshot,
  homeDataItems,
  MYSQL_ROWS,
  MONGO_DOCUMENTS,
  POSTGRES_ROWS,
  type DbSnapshot,
} from './data/demoDatabases';
import { ConferenceDataList } from './components/ConferenceDataList';
import { DatabaseViewerModal } from './components/DatabaseViewerModal';
import type { DbEngine } from './lib/dbEngine';

type RecordState = {
  ui: RecordUiState;
  receipt?: Receipt;
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
  mysql: MYSQL_ROWS,
  postgres: POSTGRES_ROWS,
  mongo: MONGO_DOCUMENTS,
});

export default function App() {
  const [canisterId, setCanisterId] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [canisterStatus, setCanisterStatus] = useState<string | null>(null);
  const [client, setClient] = useState<ZombieDeleteClient | null>(null);
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
  const lastConnectedCanisterRef = useRef<string | null>(null);

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
      [engine]: { ...prev[engine], [recordId]: patch },
    }));
  };

  const selectedState = selectedId ? engineRecords[selectedId] : undefined;
  const selectedUi = selectedState?.ui ?? 'active';
  const canEraseSelected = deletableRecordKeys(dataEngine).includes(selectedId);
  const rowInBackend = deletableRecordKeysFromSnapshot(dataEngine, dbSnapshot).includes(selectedId);
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

  useEffect(() => {
    void refreshDbSnapshot().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      logId.n += 1;
      setLogs((prev) => [{ id: logId.n, tone: 'err' as const, text: msg }, ...prev].slice(0, 12));
    });
  }, [refreshDbSnapshot, logId]);

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
    const backendKeys = deletableRecordKeysFromSnapshot(dataEngine, dbSnapshot);
    const pick = deletableRecordKeys(dataEngine).find(
      (key) => backendKeys.includes(key) && engineRecords[key]?.ui !== 'deleted'
    );
    if (pick) {
      setSelectedByEngine((prev) => ({ ...prev, [dataEngine]: pick }));
    }
  }, [apiReady, dataEngine, dbSnapshot, engineRecords, selectedId]);

  const syncRecord = async (zd: ZombieDeleteClient, engine: DbEngine, recordId: string) => {
    const subject = await demoSubjectReference(recordId);
    const lookup = await zd.getReceipt(subject);
    if (lookup.kind === 'ok') {
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

  const syncAllReceipts = async (zd: ZombieDeleteClient) => {
    for (const { engine, key } of allDeletableTargets()) {
      await syncRecord(zd, engine, key);
    }
    pushLog('info', 'Restored erasure state from canister for MySQL, PostgreSQL, and MongoDB.');
  };

  const disconnect = () => {
    clearSignerSession(client);
    setClient(null);
    setConnected(false);
    setCanisterStatus(null);
    setErasureByEngine(EMPTY_ERASURE);
    pushLog('info', 'Disconnected — paste another canister id and Connect.');
  };

  const connect = useCallback(async () => {
    const id = canisterId.trim();
    if (!id) {
      pushLog('err', 'Enter your MKTd03 canister id.');
      return;
    }
    setConnecting(true);
    setCanisterStatus(null);
    try {
      const isNewCanister = lastConnectedCanisterRef.current !== id;
      if (isNewCanister) {
        clearBackendPublicKeyCache();
        await resetDemoDatabases();
        await refreshDbSnapshot();
        lastConnectedCanisterRef.current = id;
        setReissueMessage(null);
        pushLog('info', 'New canister — backend databases reset to initial seed data.');
      }

      const persisted = loadErasureState(id);
      setErasureByEngine((persisted as ErasureByEngine | null) ?? EMPTY_ERASURE);

      const nextClient = await connectDemoClient(id);
      const status = await nextClient.getStatus();
      setClient(nextClient);
      setConnected(true);
      setCanisterStatus(status);
      const principal = getActiveSignerPrincipalText(nextClient);
      pushLog('ok', `Connected to ${id} (${getIcHost()})`);
      pushLog(
        'info',
        `Signer (${signingModeLabel()}): ${principal} — doit correspondre à Controllers: de dfx canister info.`
      );
      await syncAllReceipts(nextClient);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog('err', msg);
      setConnected(false);
      setClient(null);
    } finally {
      setConnecting(false);
    }
  }, [canisterId, pushLog, refreshDbSnapshot]);

  const resetDemo = async () => {
    try {
      clearBackendPublicKeyCache();
      await resetDemoDatabases();
      await refreshDbSnapshot();
      applyErasureState(() => EMPTY_ERASURE);
      setReissueMessage(null);
      pushLog('ok', 'Demo databases reset — all seed rows restored in the backend.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushLog('err', msg);
    }
  };

  const proveDeletion = async () => {
    if (!client || !canIssueProof || !apiReady) return;
    setBusy(true);
    setProgress(null);
    setReissueMessage(null);
    patchEngineRecord(dataEngine, selectedId, { ui: 'checking' });
    let deleteSucceeded = false;
    try {
      pushLog('info', `DELETE via demo API (${dataEngine})…`);
      const deleteResult = await deleteRecordViaApi(dataEngine, selectedId);
      deleteSucceeded = true;
      await refreshDbSnapshot();
      pushLog('ok', `Row removed from local ${dataEngine} database.`);

      const attestation = deleteResult.offsign ?? deleteResult.goneproof;
      if (!attestation) {
        throw new Error('Demo API did not return offsign attestation');
      }
      const receipt = await issueDemoAttestedDeletionReceipt(
        client,
        attestation,
        setProgress,
        {
          subjectLabel: selectedLabel.replace(/\u00b7/g, ' - '),
          dataCategory: dataEngine,
          sourceSystem: 'Infoshare booth demo',
          legalContext: 'GDPR Art. 17 - demo (backend-attested declaration)',
        },
        deleteResult.backendPublicKeyHex
      );

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

      patchEngineRecord(dataEngine, selectedId, { ui: 'deleted', receipt });
      const sum = receiptSummary(receipt);
      pushLog(
        'ok',
        `Backend-attested receipt issued for ${selectedLabel} (${dataEngine}). Tombstone ${sum.postHex}`
      );
    } catch (e) {
      let msg = formatIssuanceAgentError(client, e, canisterId);
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
          pushLog('info', 'Demo API rows restored after failed proof — you can retry.');
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
    if (!client || !canEraseSelected) return;
    setBusy(true);
    setReissueMessage(null);
    try {
      const guardMsg = await guardDemoRestore(client, selectedId);
      if (guardMsg) {
        setReissueMessage(guardMsg);
        pushLog('info', guardMsg);
        const apiRestore = await restoreRecordViaApi(dataEngine, selectedId);
        if (!apiRestore.ok) {
          pushLog('info', `API restore also blocked: ${apiRestore.message ?? apiRestore.error}`);
        }
        return;
      }
      const msg = await tryReissueDemoDeletion(client, selectedId);
      setReissueMessage(msg);
      pushLog('info', `Re-add blocked (${dataEngine}): ${msg}`);
    } catch (e) {
      const msg = formatIssuanceAgentError(client, e, canisterId);
      setReissueMessage(msg);
      pushLog('err', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 py-8 md:px-8">
      <header className="mb-8">
        <div className="flex gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white shadow-lg shadow-black/30">
            <img
              src={infoshareLogo}
              alt="Infoshare"
              className="h-[150%] w-[150%] max-w-none object-contain"
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-alt/90">
              {BRAND.demoContext}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{BRAND.name}</h1>
            <p className="mt-1 text-sm font-medium text-accent">{BRAND.tagline}</p>
            <p className="mt-2 max-w-xl text-slate-400 text-sm leading-relaxed">{BRAND.description}</p>
          </div>
        </div>
      </header>

      <section className="demo-panel mb-6">
        <h2 className="text-sm font-semibold text-slate-300">MKTd03 canister (client-hosted)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Paste any MKTd03 canister id (local dfx or mainnet), then Connect. Connecting a{' '}
          <strong>different</strong> canister resets the demo backend to fresh seed data. Receipts
          are saved per canister in this browser. This demo issues a{' '}
          <strong>backend-attested deletion receipt</strong> — not a trustless proof that Postgres
          was wiped.
        </p>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-slate-500">Vault canister id</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm outline-none ring-accent/40 focus:ring-2"
              value={canisterId}
              onChange={(e) => setCanisterId(e.target.value)}
              placeholder="aaaaa-aa"
              disabled={connected}
            />
          </label>
          <label className="md:w-56 text-sm">
            <span className="mb-1 block text-slate-500">IC host</span>
            <input
              className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-slate-400"
              value={getIcHost()}
              readOnly
            />
          </label>
          <button
            type="button"
            className="demo-btn-primary shrink-0"
            onClick={() => void connect()}
            disabled={connecting || connected}
          >
            {connecting ? 'Connecting…' : connected ? 'Connected' : 'Connect'}
          </button>
          {connected ? (
            <button type="button" className="demo-btn-ghost shrink-0" onClick={disconnect}>
              Disconnect
            </button>
          ) : null}
          <button
            type="button"
            className="demo-btn-ghost shrink-0 text-xs"
            disabled={!apiReady}
            onClick={() => void resetDemo()}
          >
            Reset demo DB
          </button>
        </div>
        {canisterStatus ? (
          <p className="mt-3 font-mono text-xs text-accent/90">Canister: {canisterStatus}</p>
        ) : null}
        {!connected ? (
          <p className="mt-3 text-xs text-slate-500">
            Deploy MKTd03 from Together-alone or local <code className="text-slate-400">dfx</code>).
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="demo-panel lg:col-span-2">
          <ConferenceDataList
            engine={dataEngine}
            onEngineChange={setDataEngine}
            records={engineRecords}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onVisualize={() => setDbModalOpen(true)}
          />
        </section>

        <section className="demo-panel lg:col-span-3">
          <h2 className="text-sm font-semibold text-slate-300">Erasure workflow</h2>
          {canEraseSelected ? (
            <>
              <p className="mt-2 text-slate-400 text-sm">
                Selected ({dataEngine}): <span className="text-white">{selectedLabel}</span>
              </p>

              <ol className="mt-5 space-y-3 text-sm">
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
                  Try to restore attendee data
                </button>
              </div>

              {!connected ? (
                <p className="mt-3 text-sm text-warn">Connect the canister above to issue a proof.</p>
              ) : null}
              {connected && !rowInBackend && selectedUi === 'active' ? (
                <p className="mt-3 text-sm text-slate-500">
                  This row is not in the backend database anymore. Use <strong>Reset demo DB</strong>{' '}
                  or pick a row still live in Visualize database.
                </p>
              ) : null}

              {selectedUi === 'deleted' && selectedState?.receipt ? (
                <ReceiptCard
                  receipt={selectedState.receipt}
                  client={client}
                  recordId={selectedId}
                  subjectLabel={selectedLabel}
                  onLog={pushLog}
                />
              ) : null}

              {reissueMessage ? (
                <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
                  <strong>Re-add blocked.</strong> {reissueMessage}
                </div>
              ) : null}

              {selectedState?.lastError ? (
                <p className="mt-3 text-sm text-danger">{selectedState.lastError}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Select a demo-linked row in your platform data (MySQL, PostgreSQL, or MongoDB) to run
              the erasure workflow. Each store has its own on-chain subject.
            </p>
          )}
        </section>
      </div>

      <section className="demo-panel mt-6">
        <h2 className="text-sm font-semibold text-slate-300">Activity log</h2>
        <ul className="mt-3 space-y-1 font-mono text-xs">
          {logs.length === 0 ? (
            <li className="text-slate-600">Connect a canister to start.</li>
          ) : (
            logs.map((line) => (
              <li
                key={line.id}
                className={
                  line.tone === 'ok'
                    ? 'text-accent'
                    : line.tone === 'err'
                      ? 'text-danger'
                      : 'text-slate-400'
                }
              >
                {line.text}
              </li>
            ))
          )}
        </ul>
      </section>

      <DatabaseViewerModal
        open={dbModalOpen}
        onClose={() => setDbModalOpen(false)}
        snapshot={dbSnapshot}
        engine={dataEngine}
        onEngineChange={setDataEngine}
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
  return (
    <li
      className={`flex gap-3 rounded-xl border px-3 py-3 ${
        active
          ? 'border-accent/40 bg-accent/5'
          : done
            ? 'border-white/10 bg-white/5'
            : 'border-white/5 bg-black/20 opacity-70'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? 'bg-accent text-white' : active ? 'bg-accent/30 text-accent' : 'bg-white/10 text-slate-500'
        }`}
      >
        {n}
      </span>
      <div>
        <div className="font-medium text-slate-200">{title}</div>
        <p className="mt-1 text-slate-500 text-xs leading-relaxed">{children}</p>
      </div>
    </li>
  );
}

function ReceiptCard({
  receipt,
  client,
  recordId,
  subjectLabel,
  onLog,
}: {
  receipt: Receipt;
  client: ZombieDeleteClient | null;
  recordId: string;
  subjectLabel: string;
  onLog: (tone: LogLine['tone'], text: string) => void;
}) {
  const sum = receiptSummary(receipt);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const downloadPdf = async () => {
    if (!client) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const subject = await demoSubjectReference(recordId);
      await client.downloadAuditPdf(subject, `deletion-audit-${recordId}.pdf`);
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
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="font-semibold text-accent">Deletion receipt on file</p>
        <button
          type="button"
          className="demo-btn-ghost px-3 py-1.5 text-xs"
          disabled={!client || pdfBusy}
          onClick={() => void downloadPdf()}
        >
          {pdfBusy ? 'Generating PDF…' : 'Download PDF certificate'}
        </button>
      </div>
      <dl className="mt-2 space-y-1 font-mono text-slate-400">
        <div className="flex justify-between gap-4">
          <dt>subject</dt>
          <dd className="text-slate-300">{sum.subjectHex}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>pre-state</dt>
          <dd className="text-slate-300">{sum.preHex}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>post-state</dt>
          <dd className="text-slate-300">{sum.postHex}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>proof</dt>
          <dd className="text-slate-300">{sum.proofLen} bytes</dd>
        </div>
      </dl>
      {!client ? (
        <p className="mt-2 text-slate-500">Connect the canister to download the PDF.</p>
      ) : null}
      {pdfError ? <p className="mt-3 text-danger">{pdfError}</p> : null}
    </div>
  );
}