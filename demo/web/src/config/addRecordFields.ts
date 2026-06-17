import type { DbEngine } from '../lib/dbEngine';
import { DELETION_KEY_OPTIONS } from '@demo-shared/deletionSubject';

export type AddFieldDef = {
  name: string;
  label: string;
  required?: boolean;
  type?: 'text' | 'number' | 'textarea' | 'json' | 'select';
  placeholder?: string;
  wide?: boolean;
  hint?: string;
  options?: { value: string; label: string }[];
};

function deletionKeyFieldDef(engine: DbEngine): AddFieldDef {
  const options = DELETION_KEY_OPTIONS[engine].map((k) => ({
    value: k.keyField,
    label: `${k.label} (default)`,
  }));
  return {
    name: 'deletionKeyField',
    label: 'Destruction key field',
    type: 'select',
    required: true,
    hint: 'CVDR subject = {engine}/{table}/{keyField}/{value} — same email after erasure hits the same tombstone.',
    options,
  };
}

const MYSQL_FIELDS: AddFieldDef[] = [
  deletionKeyFieldDef('mysql'),
  { name: 'category', label: 'category', required: true, placeholder: 'Customer' },
  { name: 'full_name', label: 'full_name', required: true, wide: true, placeholder: 'Jane Doe' },
  { name: 'email', label: 'email', required: true, wide: true, placeholder: 'jane@example.com' },
  { name: 'company', label: 'company', required: true, wide: true, placeholder: 'Acme Corp' },
  { name: 'pass_type', label: 'pass_type', required: true, placeholder: 'General Pass' },
  {
    name: 'payload_summary',
    label: 'payload_summary',
    required: true,
    type: 'textarea',
    wide: true,
    placeholder: 'badge_qr, newsletter_opt_in',
  },
];

const POSTGRES_FIELDS: AddFieldDef[] = [
  deletionKeyFieldDef('postgres'),
  { name: 'source', label: 'source', required: true, placeholder: 'registration' },
  { name: 'contact_name', label: 'contact_name', required: true, wide: true, placeholder: 'Jane Doe' },
  { name: 'contact_email', label: 'contact_email', required: true, wide: true, placeholder: 'jane@example.com' },
  { name: 'org', label: 'org', required: true, wide: true, placeholder: 'Acme Corp' },
  { name: 'interaction_type', label: 'interaction_type', required: true, placeholder: 'badge_issued' },
  {
    name: 'metadata',
    label: 'metadata',
    required: true,
    type: 'textarea',
    wide: true,
    placeholder: '{"newsletter":true}',
  },
];

const MONGO_FIELDS: AddFieldDef[] = [
  deletionKeyFieldDef('mongo'),
  { name: 'collection', label: 'collection', required: true, placeholder: 'demo_documents' },
  {
    name: 'docJson',
    label: 'doc (JSON)',
    required: true,
    type: 'json',
    wide: true,
    placeholder: '{\n  "type": "Customer",\n  "title": "Jane Doe",\n  "email": "jane@example.com",\n  "status": "ACTIVE"\n}',
  },
];

export function addRecordFields(engine: DbEngine): AddFieldDef[] {
  if (engine === 'mysql') return MYSQL_FIELDS;
  if (engine === 'postgres') return POSTGRES_FIELDS;
  return MONGO_FIELDS;
}

export function defaultAddRecordValues(engine: DbEngine): Record<string, string> {
  const defaultKey = DELETION_KEY_OPTIONS[engine][0]?.keyField ?? 'email';
  if (engine === 'mysql') {
    return {
      deletionKeyField: defaultKey,
      category: 'Customer',
      full_name: '',
      email: '',
      company: '',
      pass_type: 'General Pass',
      payload_summary: '',
    };
  }
  if (engine === 'postgres') {
    return {
      deletionKeyField: defaultKey,
      source: 'custom_insert',
      contact_name: '',
      contact_email: '',
      org: '',
      interaction_type: 'active',
      metadata: '{}',
    };
  }
  return {
    deletionKeyField: defaultKey,
    collection: 'demo_documents',
    docJson:
      '{\n  "type": "Customer",\n  "title": "",\n  "email": "",\n  "status": "ACTIVE"\n}',
  };
}
