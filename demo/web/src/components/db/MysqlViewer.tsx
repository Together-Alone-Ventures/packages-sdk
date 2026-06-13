import { DEMO_COMPANY } from '@demo-shared/company';
import { MYSQL_SCHEMA, MYSQL_TABLE, type MysqlPiiRow } from '../../data/demoDatabases';
import { DbDeletionFooter } from './DbDeletionFooter';

type Props = { rows: MysqlPiiRow[]; removedCount?: number };

const COLUMNS: { key: keyof MysqlPiiRow; label: string; wide?: boolean }[] = [
  { key: 'id', label: 'id' },
  { key: 'category', label: 'category' },
  { key: 'full_name', label: 'full_name', wide: true },
  { key: 'email', label: 'email', wide: true },
  { key: 'company', label: 'company', wide: true },
  { key: 'pass_type', label: 'pass_type' },
  { key: 'payload_summary', label: 'payload_summary', wide: true },
  { key: 'created_at', label: 'created_at' },
];

export function MysqlViewer({ rows, removedCount = 0 }: Props) {
  const deletableTotal = rows.filter((r) => r.recordKey).length + removedCount;
  const removed = removedCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="db-modal-toolbar">
        <div>
          <p className="db-modal-breadcrumb">
            Server: <span className="pg-breadcrumb">{DEMO_COMPANY.mysqlServerLabel}</span> · Database:{' '}
            <span className="pg-breadcrumb">{MYSQL_SCHEMA}</span> · Table:{' '}
            <span className="text-emerald-400">{MYSQL_TABLE}</span>
          </p>
          <h2 className="db-modal-title">Browse: {MYSQL_TABLE}</h2>
        </div>
        <span className="db-modal-badge">
          {rows.length} row{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="db-modal-tabs">
        <span className="db-modal-tab db-modal-tab--active">Browse</span>
        <span className="db-modal-tab">Structure</span>
        <span className="db-modal-tab">SQL</span>
      </div>

      <div className="db-table-wrap">
        <table className="db-table">
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className={col.wide ? 'db-th-wide' : undefined}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="db-empty">
                  No rows. Erased records are removed from this table (GDPR delete).
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.recordKey ?? row.id} className={i % 2 === 0 ? 'db-row-even' : 'db-row-odd'}>
                  {COLUMNS.map((col) => (
                    <td key={col.key} className={col.wide ? 'db-td-wide' : undefined}>
                      {String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <DbDeletionFooter removed={removed} deletableTotal={deletableTotal} engineLabel="MySQL" />
    </div>
  );
}
