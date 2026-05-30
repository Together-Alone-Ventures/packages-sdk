import { homeDataItems } from '../data/demoDatabases';
import { DB_ENGINES, type DbEngine } from '../lib/dbEngine';

import type { RecordErasureState } from '../data/demoDatabases';

type Props = {
  engine: DbEngine;
  onEngineChange: (engine: DbEngine) => void;
  records: Record<string, RecordErasureState | undefined>;
  selectedId: string;
  onSelect: (id: string) => void;
  onVisualize: () => void;
};

export function ConferenceDataList({
  engine,
  onEngineChange,
  records,
  selectedId,
  onSelect,
  onVisualize,
}: Props) {
  const items = homeDataItems(engine);
  const engineMeta = DB_ENGINES.find((e) => e.id === engine)!;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Conference platform data</h2>
        <button type="button" className="demo-btn-ghost px-3 py-1.5 text-xs" onClick={onVisualize}>
          Visualize database
        </button>
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Data store
        </label>
        <div className="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
          {DB_ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onEngineChange(e.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-center transition ${
                engine === e.id
                  ? 'bg-white/15 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="block text-[11px] font-semibold">{e.label}</span>
              <span className="block text-[9px] opacity-70">{e.short}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 font-mono text-[10px] text-slate-600">
          {engineMeta.label} · {items.length} attendee-linked record
          {items.length === 1 ? '' : 's'}
        </p>
      </div>

      <ul className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto pr-0.5">
        {items.map((item) => {
          const st = item.recordKey ? records[item.recordKey] : undefined;
          const ui = st?.ui ?? 'active';
          const isSelected = item.recordKey
            ? item.recordKey === selectedId
            : item.id === selectedId;
          const badge =
            ui === 'deleted'
              ? 'Erased · proof on file'
              : ui === 'checking'
                ? 'Processing…'
                : 'Active';
          const badgeClass =
            ui === 'deleted'
              ? 'bg-accent/15 text-accent'
              : ui === 'checking'
                ? 'bg-warn/15 text-warn'
                : 'bg-white/10 text-slate-300';
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => item.recordKey && onSelect(item.recordKey)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                  isSelected
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-white/10 bg-black/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-alt/80">
                      {item.category}
                    </span>
                    <div className="font-medium text-sm">{item.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badgeClass}`}
                  >
                    {badge}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
