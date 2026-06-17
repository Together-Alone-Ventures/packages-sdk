import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DbEngine } from '../lib/dbEngine';
import { DB_ENGINES } from '../lib/dbEngine';
import { previewDeletionHandleFromForm } from '@demo-shared/deletionSubject';
import {
  addRecordFields,
  defaultAddRecordValues,
  type AddFieldDef,
} from '../config/addRecordFields';

export type AddRecordFormValues = Record<string, string>;

type Props = {
  open: boolean;
  engine: DbEngine;
  tableOrCollection?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: AddRecordFormValues) => void | Promise<void>;
};

function FieldInput({
  field,
  value,
  disabled,
  onChange,
}: {
  field: AddFieldDef;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const className = field.wide ? 'demo-input font-mono text-[13px]' : 'demo-input font-mono text-[13px]';
  if (field.type === 'select' && field.options) {
    return (
      <select
        className={className}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={field.required}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'textarea' || field.type === 'json') {
    return (
      <textarea
        className={`${className} min-h-[5rem] resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
        required={field.required}
        spellCheck={field.type !== 'json'}
      />
    );
  }
  return (
    <input
      className={className}
      type={field.type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      disabled={disabled}
      required={field.required}
    />
  );
}

export function AddRecordModal({
  open,
  engine,
  tableOrCollection,
  busy = false,
  error,
  onClose,
  onSubmit,
}: Props) {
  const fields = useMemo(() => addRecordFields(engine), [engine]);
  const [values, setValues] = useState<AddRecordFormValues>(() => defaultAddRecordValues(engine));

  useEffect(() => {
    if (open) setValues(defaultAddRecordValues(engine));
  }, [open, engine]);

  const engineMeta = useMemo(() => DB_ENGINES.find((e) => e.id === engine)!, [engine]);

  const previewHandle = useMemo(() => previewDeletionHandleFromForm(engine, values), [engine, values]);

  if (!open) return null;

  const setField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void onSubmit({ ...values });
  };

  return (
    <div
      className="db-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-record-title"
      onClick={onClose}
    >
      <div
        className="demo-panel mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="demo-panel-header shrink-0">
          <h2 id="add-record-title" className="demo-section-title">
            Insert row
          </h2>
          <button type="button" className="demo-btn-ghost px-3 py-1.5 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto pr-0.5">
          <p className="text-sm text-zinc-400">
            Target: <span className="font-medium text-zinc-200">{engineMeta.label}</span>
            {tableOrCollection ? (
              <>
                {' '}
                · <span className="font-mono text-zinc-300">{tableOrCollection}</span>
              </>
            ) : null}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-400">id</strong> is DB-generated (new row each insert).{' '}
            CVDR identity is{' '}
            <code className="text-zinc-400">{'{engine}/{table}/{keyField}/{value}'}</code> — same
            email after erasure hits the same tombstone even with a new SQL id. Insert runs{' '}
            <code className="text-zinc-400">guardRestoreAgainstMktd03()</code> first.
          </p>

          {previewHandle ? (
            <p className="mt-2 font-mono text-[11px] text-emerald-400/90">
              Deletion handle: {previewHandle}
            </p>
          ) : null}

          <form className="mt-5 space-y-3" onSubmit={submit}>
            {fields.map((field) => (
              <label key={field.name} className="block">
                <span className="mb-1 block font-mono text-[11px] text-zinc-500">{field.label}</span>
                <FieldInput
                  field={field}
                  value={values[field.name] ?? ''}
                  disabled={busy}
                  onChange={(v) => setField(field.name, v)}
                />
                {field.hint ? (
                  <span className="mt-1 block text-[11px] text-zinc-500">{field.hint}</span>
                ) : null}
              </label>
            ))}

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="submit" className="demo-btn-primary" disabled={busy}>
                {busy ? 'Checking CVDR…' : 'Insert row'}
              </button>
              <button type="button" className="demo-btn-ghost" disabled={busy} onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
