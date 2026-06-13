import { PG_DATABASE, PG_SCHEMA, PG_TABLE, type PostgresRow } from '../../data/demoDatabases';
import { DbDeletionFooter } from './DbDeletionFooter';

type Props = { rows: PostgresRow[]; removedCount?: number };

const COLUMNS: { key: keyof PostgresRow; label: string; pgType: string; wide?: boolean }[] = [
  { key: 'id', label: 'id', pgType: 'text' },
  { key: 'source', label: 'source', pgType: 'varchar(32)' },
  { key: 'contact_name', label: 'contact_name', pgType: 'text', wide: true },
  { key: 'contact_email', label: 'contact_email', pgType: 'text', wide: true },
  { key: 'org', label: 'org', pgType: 'text', wide: true },
  { key: 'interaction_type', label: 'interaction_type', pgType: 'varchar(48)' },
  { key: 'metadata', label: 'metadata', pgType: 'jsonb', wide: true },
  { key: 'updated_at', label: 'updated_at', pgType: 'timestamptz' },
];

export function PostgresViewer({ rows, removedCount = 0 }: Props) {
  const deletableTotal = rows.filter((r) => r.recordKey).length + removedCount;
  const removed = removedCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="pg-toolbar">
        <div>
          <p className="pg-breadcrumb">
            PostgreSQL 16 · <span>{PG_DATABASE}</span> · {PG_SCHEMA}.{PG_TABLE}
          </p>
          <h2 className="pg-title">Table Editor · {PG_TABLE}</h2>
        </div>
        <span className="pg-badge">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="pg-tabs">
        <span className="pg-tab pg-tab--active">Data</span>
        <span className="pg-tab">Columns</span>
        <span className="pg-tab">Constraints</span>
        <span className="pg-tab">SQL</span>
      </div>

      <div className="pg-table-wrap">
        <table className="pg-table">
          <thead>
            <tr className="pg-head-names">
              {COLUMNS.map((col) => (
                <th key={col.key} className={col.wide ? 'pg-th-wide' : undefined}>
                  {col.label}
                </th>
              ))}
            </tr>
            <tr className="pg-head-types">
              {COLUMNS.map((col) => (
                <th key={`${col.key}-type`} className={col.wide ? 'pg-th-wide' : undefined}>
                  {col.pgType}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="pg-empty">
                  No rows returned. Erased demo records are deleted from this table.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.recordKey ?? row.id} className={i % 2 === 0 ? 'pg-row-even' : 'pg-row-odd'}>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className={col.wide ? 'pg-td-wide' : undefined}>
                      {String(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DbDeletionFooter
        removed={removed}
        deletableTotal={deletableTotal}
        engineLabel="PostgreSQL"
        footerClass="pg-modal-footer"
      />
    </div>
  );
}
