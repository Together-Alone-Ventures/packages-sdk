/** Neutral fake-company skin for the OffSign / MKTd03 interactive demo. */
export const DEMO_COMPANY = {
  name: 'Meridian Cloud',
  tagline: 'Delete personal data. Record a signed declaration on-chain.',
  description:
    'SaaS platform demo: DELETE a customer row in your Web2 stores, your API signs a structured attestation, then MKTd03 records a tombstone receipt auditors can verify. They still trust your backend for database state.',
  demoContext: 'Platform demo · GDPR erasure workflow',
  poweredBy: 'OffSign SDK · Demo MKTd03 · By Together Alone Ventures',
  sourceSystem: 'Meridian Cloud platform demo',
  sourceSystemApi: 'Meridian Cloud platform demo API',
  subjectPrefix: 'meridian-demo:',
  mysqlServerLabel: 'meridian-demo',
  mysqlSchema: 'meridian_platform',
  postgresDatabase: 'meridian_prod',
  mongoCluster: 'meridian-prod.abc12.mongodb.net',
  mongoDatabase: 'meridian_platform',
} as const;
