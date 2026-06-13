import { DB_ENGINES, type DbEngine } from '../lib/dbEngine';
import type { DbSnapshot } from '../data/demoDatabases';
import { MongoViewer } from './db/MongoViewer';
import { MysqlViewer } from './db/MysqlViewer';
import { PostgresViewer } from './db/PostgresViewer';

type Props = {
  open: boolean;
  onClose: () => void;
  snapshot: DbSnapshot;
  engine: DbEngine;
  onEngineChange: (engine: DbEngine) => void;
  removedCount?: number;
};

export function DatabaseViewerModal({
  open,
  onClose,
  snapshot,
  engine,
  onEngineChange,
  removedCount = 0,
}: Props) {

  if (!open) return null;

  const panelClass =
    engine === 'mongo'
      ? 'db-modal-panel db-modal-panel--mongo'
      : engine === 'postgres'
        ? 'db-modal-panel db-modal-panel--pg'
        : 'db-modal-panel';

  return (
    <div
      className="db-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="db-modal-title"
      onClick={onClose}
    >
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        <div className="db-engine-bar">
          <div className="db-engine-tabs" role="tablist" aria-label="Database engine">
            {DB_ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={engine === e.id}
                className={`db-engine-tab ${engine === e.id ? 'db-engine-tab--active' : ''}`}
                onClick={() => onEngineChange(e.id)}
              >
                <span className="db-engine-tab-label">{e.label}</span>
                <span className="db-engine-tab-sub">{e.short}</span>
              </button>
            ))}
          </div>
          <button type="button" className="demo-btn-ghost text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div id="db-modal-title" className="sr-only">
          Database viewer ({engine})
        </div>

        {engine === 'mysql' ? (
          <MysqlViewer rows={snapshot.mysql} removedCount={removedCount} />
        ) : engine === 'postgres' ? (
          <PostgresViewer rows={snapshot.postgres} removedCount={removedCount} />
        ) : (
          <MongoViewer documents={snapshot.mongo} removedCount={removedCount} />
        )}
      </div>
    </div>
  );
}
