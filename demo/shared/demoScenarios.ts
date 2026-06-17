/** Interactive demo scenarios — same canister flow, different seed records and copy. */

export type ScenarioRecord = {
  type: string;
  title: string;
  fields: string[];
};

export type ScenarioId =
  | 'gdpr-erasure'
  | 'ma-data-room'
  | 'key-destruction'
  | 'training-data-removal'
  | 'data-broker-drop'
  | 'retention-ceiling';

export type DemoScenario = {
  id: ScenarioId;
  label: string;
  eyebrow: string;
  subtitle: string;
  /** When true, uses the full legacy GDPR customer seed from demoDatabases.ts */
  useLegacySeed?: boolean;
  records?: ScenarioRecord[];
};

export const DEFAULT_SCENARIO_ID: ScenarioId = 'gdpr-erasure';

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'gdpr-erasure',
    label: 'GDPR erasure',
    eyebrow: 'GDPR ERASURE',
    subtitle: 'Delete a customer record. Prove it cannot return.',
    useLegacySeed: true,
  },
  {
    id: 'ma-data-room',
    label: 'M&A data room',
    eyebrow: 'CONTRACTUAL DESTRUCTION',
    subtitle: 'Deal collapsed. Destroy the data room under the NDA and prove it.',
    records: [
      { type: 'DUE DILIGENCE', title: 'Buyer pack #DD-2026-014', fields: ['doc_hash', 'nda_ref', 'access_expiry', 'room_id'] },
      { type: 'DUE DILIGENCE', title: 'Financial model v7', fields: ['xlsx_hash', 'nda_ref', 'shared_with', 'room_id'] },
      { type: 'LEGAL', title: 'Disclosure schedule A', fields: ['doc_hash', 'counsel_ref', 'access_expiry'] },
      { type: 'DUE DILIGENCE', title: 'Customer list export', fields: ['csv_hash', 'nda_ref', 'access_expiry'] },
    ],
  },
  {
    id: 'key-destruction',
    label: 'Encryption key destruction',
    eyebrow: 'KEY DESTRUCTION',
    subtitle: 'Retire an encryption key. Prove it cannot be re-issued.',
    records: [
      { type: 'KEY', title: 'DEK-2024-aes-0098', fields: ['key_handle', 'algo', 'kek_ref', 'retired_at'] },
      { type: 'KEY', title: 'DEK-2024-aes-0099', fields: ['key_handle', 'algo', 'kek_ref', 'retired_at'] },
      { type: 'KEY', title: 'Signing key sk-prod-04', fields: ['key_handle', 'algo', 'rotated_from', 'retired_at'] },
      { type: 'KEY', title: 'Backup wrap key bwk-11', fields: ['key_handle', 'algo', 'kek_ref', 'retired_at'] },
    ],
  },
  {
    id: 'training-data-removal',
    label: 'AI training-data removal',
    eyebrow: 'TRAINING DATA REMOVAL',
    subtitle: 'Remove a sample from the training set. Prove it will not re-enter.',
    records: [
      { type: 'TRAINING SHARD', title: 'Sample sh-44812 (licensor claw-back)', fields: ['shard_id', 'sample_hash', 'licence_ref', 'opt_out_flag'] },
      { type: 'TRAINING SHARD', title: 'Sample sh-44813 (subject opt-out)', fields: ['shard_id', 'sample_hash', 'opt_out_flag', 'received_at'] },
      { type: 'TRAINING SHARD', title: 'Sample sh-44900 (licence expired)', fields: ['shard_id', 'sample_hash', 'licence_ref', 'expiry'] },
      { type: 'TRAINING SHARD', title: 'Sample sh-44901 (revoked)', fields: ['shard_id', 'sample_hash', 'licence_ref', 'opt_out_flag'] },
    ],
  },
  {
    id: 'data-broker-drop',
    label: 'Data broker delete (California DROP)',
    eyebrow: 'REGULATORY DESTRUCTION',
    subtitle: 'Honour a universal delete request. Prove deletion across feeds, on time.',
    records: [
      { type: 'PROFILE', title: 'Consumer profile #DROP-2026-22817', fields: ['profile_id', 'source_feed', 'request_id', 'deadline'] },
      { type: 'PROFILE', title: 'Consumer profile #DROP-2026-22818', fields: ['profile_id', 'source_feed', 'request_id', 'deadline'] },
      { type: 'PROFILE', title: 'Consumer profile #DROP-2026-22901', fields: ['profile_id', 'source_feed', 'request_id', 'deadline'] },
      { type: 'PROFILE', title: 'Consumer profile #DROP-2026-22902', fields: ['profile_id', 'source_feed', 'request_id', 'deadline'] },
    ],
  },
  {
    id: 'retention-ceiling',
    label: 'Retention-ceiling expiry',
    eyebrow: 'MANDATORY DESTRUCTION',
    subtitle: 'Records past their legal retention ceiling. Prove they were destroyed on schedule.',
    records: [
      { type: 'LOG BATCH', title: 'Transaction log Q1-2019', fields: ['batch_ref', 'record_class', 'retention_expiry', 'jurisdiction'] },
      { type: 'LOG BATCH', title: 'Transaction log Q2-2019', fields: ['batch_ref', 'record_class', 'retention_expiry', 'jurisdiction'] },
      { type: 'LOG BATCH', title: 'KYC archive 2018', fields: ['batch_ref', 'record_class', 'retention_expiry', 'jurisdiction'] },
      { type: 'LOG BATCH', title: 'Call recordings 2018', fields: ['batch_ref', 'record_class', 'retention_expiry', 'jurisdiction'] },
    ],
  },
];

export function findScenario(id: string): DemoScenario | undefined {
  return DEMO_SCENARIOS.find((s) => s.id === id);
}

export function isScenarioId(id: string): id is ScenarioId {
  return DEMO_SCENARIOS.some((s) => s.id === id);
}
