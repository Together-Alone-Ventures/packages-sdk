import { useMemo, useState } from 'react';
import {
  MONGO_CLUSTER,
  MONGO_COLLECTIONS,
  MONGO_DATABASE,
  MONGO_DOCUMENTS,
  type MongoDocument,
} from '../../data/demoDatabases';
import { DbDeletionFooter } from './DbDeletionFooter';

type Props = { documents: MongoDocument[] };

function formatJson(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent);
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = value.map((v) => `${pad}  ${formatJson(v, indent + 1)}`).join(',\n');
    return `[\n${inner}\n${pad}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const inner = entries
    .map(([k, v]) => `${pad}  ${JSON.stringify(k)}: ${formatJson(v, indent + 1)}`)
    .join(',\n');
  return `{\n${inner}\n${pad}}`;
}

export function MongoViewer({ documents }: Props) {
  const deletableTotal = MONGO_DOCUMENTS.filter((d) => d.recordKey).length;
  const removed = deletableTotal - documents.filter((d) => d.recordKey).length;

  const collectionsWithCounts = useMemo(() => {
    return MONGO_COLLECTIONS.map((c) => ({
      ...c,
      visibleCount: documents.filter((d) => d.collection === c.name).length,
    }));
  }, [documents]);

  const [activeCollection, setActiveCollection] = useState('attendee_profiles');
  const docs = documents.filter((d) => d.collection === activeCollection);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mongo-toolbar">
        <div>
          <p className="mongo-breadcrumb">
            Cluster: <span>{MONGO_CLUSTER}</span> · Database: <span>{MONGO_DATABASE}</span>
          </p>
          <h2 className="mongo-title">Compass · Collections</h2>
        </div>
        <span className="mongo-badge">
          {documents.length} doc{documents.length === 1 ? '' : 's'} (demo-linked)
        </span>
      </div>

      <div className="mongo-body">
        <aside className="mongo-sidebar">
          <p className="mongo-sidebar-label">{MONGO_DATABASE}</p>
          <ul className="mongo-collection-list">
            {collectionsWithCounts.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  className={`mongo-collection-btn ${
                    activeCollection === c.name ? 'mongo-collection-btn--active' : ''
                  }`}
                  onClick={() => setActiveCollection(c.name)}
                >
                  <span className="mongo-collection-icon">{`{}`}</span>
                  <span className="mongo-collection-name">{c.name}</span>
                  <span className="mongo-collection-count">{c.visibleCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="mongo-docs">
          <p className="mongo-docs-header">
            {activeCollection} · {docs.length} document{docs.length === 1 ? '' : 's'}
          </p>
          {docs.length === 0 ? (
            <p className="mongo-empty">
              No documents in this collection. Erased demo records are removed from MongoDB.
            </p>
          ) : (
            <ul className="mongo-doc-list">
              {docs.map((item) => (
                <li key={item._id} className="mongo-doc-card">
                  <p className="mongo-doc-id">{item._id}</p>
                  <pre className="mongo-doc-json">{formatJson(item.doc)}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <DbDeletionFooter
        removed={removed}
        deletableTotal={deletableTotal}
        engineLabel="MongoDB"
        footerClass="mongo-modal-footer"
      />
    </div>
  );
}
