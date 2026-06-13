import {
  deletableRecordKeysFromSnapshot,
  homeDataItems,
  type DbSnapshot,
} from '../data/demoDatabases';
import { DB_ENGINES, type DbEngine } from '../lib/dbEngine';

import type { RecordErasureState } from '../data/demoDatabases';

type Props = {
  engine: DbEngine;
  onEngineChange: (engine: DbEngine) => void;
  snapshot: DbSnapshot;
  records: Record<string, RecordErasureState | undefined>;
  selectedId: string;
  onSelect: (id: string) => void;
  onVisualize: () => void;
};

export function PlatformDataList({
  engine,
  onEngineChange,
  snapshot,
  records,
  selectedId,
  onSelect,
  onVisualize,
}: Props) {
  const items = homeDataItems(engine);
  const liveInDb = deletableRecordKeysFromSnapshot(engine, snapshot).length;
  const engineMeta = DB_ENGINES.find((e) => e.id === engine)!;

  return (
    <>
      <div className="demo-panel-header">
        <h2 className="demo-section-title">Platform data</h2>
        <button type="button" className="demo-btn-ghost px-3 py-1.5 text-xs" onClick={onVisualize}>
          Visualize database
        </button>
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Data store
        </label>
        <div className="demo-segment">
          {DB_ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onEngineChange(e.id)}
              className={`demo-segment-btn ${engine === e.id ? 'demo-segment-btn--active' : ''}`}
            >
              <span className="block text-[11px] font-semibold">{e.label}</span>
              <span className="block text-[9px] opacity-80">{e.short}</span>
            </button>
          ))}
        </div>
        <p className="demo-meta">
          {engineMeta.label} · {items.length} demo record{items.length === 1 ? '' : 's'} · {liveInDb}{' '}
          live in DB
        </p>
      </div>

      <ul className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto pr-0.5">
        {items.map((item) => {
          const st = item.recordKey ? records[item.recordKey] : undefined;
          const ui = st?.ui ?? 'active';
          const isSelected = item.recordKey
            ? item.recordKey === selectedId
            : item.id === selectedId;
          const badge =
            ui === 'deleted'
              ? 'Erased'
              : ui === 'checking'
                ? 'Processing…'
                : 'Active';
          const chipClass =
            ui === 'deleted'
              ? 'demo-chip demo-chip--success'
              : ui === 'checking'
                ? 'demo-chip demo-chip--warn'
                : 'demo-chip demo-chip--active';
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => item.recordKey && onSelect(item.recordKey)}
                className={`demo-record ${isSelected ? 'demo-record--selected' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500">
                      {item.category}
                    </span>
                    <div className="truncate font-medium text-sm text-zinc-50">{item.label}</div>
                    <div className="mt-1 truncate text-xs text-zinc-500">{item.detail}</div>
                  </div>
                  <span className={chipClass}>{badge}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
