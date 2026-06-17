import {
  MONGO_DOCUMENTS,
  MYSQL_ROWS,
  POSTGRES_ROWS,
  type MongoDocument,
  type MysqlPiiRow,
  type PostgresRow,
} from './demoDatabases.js';
import {
  DEFAULT_SCENARIO_ID,
  type DemoScenario,
  type ScenarioId,
  type ScenarioRecord,
  findScenario,
} from './demoScenarios.js';

export type ScenarioSeed = {
  mysql: MysqlPiiRow[];
  postgres: PostgresRow[];
  mongo: MongoDocument[];
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 56);
}

function engineForIndex(index: number): 'mysql' | 'postgres' | 'mongo' {
  if (index === 1) return 'postgres';
  if (index === 2) return 'mongo';
  return 'mysql';
}

function toMysqlRow(scenario: DemoScenario, record: ScenarioRecord, index: number): MysqlPiiRow {
  const slug = slugify(record.title);
  const fieldsSummary = record.fields.join(', ');
  return {
    recordKey: `mysql:${scenario.id}-${slug}`,
    id: 9000 + index,
    category: record.type,
    full_name: record.title,
    email: 'n/a',
    company: 'demo',
    pass_type: record.type,
    payload_summary: fieldsSummary,
    created_at: '2026-06-01 10:00:00',
  };
}

function toPostgresRow(scenario: DemoScenario, record: ScenarioRecord, index: number): PostgresRow {
  const slug = slugify(record.title);
  const fieldsSummary = record.fields.join(', ');
  const id = `${scenario.id}_${index}`;
  return {
    recordKey: `postgres:${scenario.id}-${slug}`,
    id,
    source: record.type.toLowerCase().replace(/\s+/g, '_'),
    contact_name: record.title,
    contact_email: 'n/a',
    org: 'demo',
    interaction_type: 'active',
    metadata: `{"fields":"${fieldsSummary}"}`,
    updated_at: '2026-06-01T10:00:00+00',
  };
}

function toMongoDoc(scenario: DemoScenario, record: ScenarioRecord, index: number): MongoDocument {
  const slug = slugify(record.title);
  const oid = `682b${(index + 1).toString(16).padStart(2, '0')}009f0a4c00${(9000 + index).toString(16)}`;
  const fieldMap = Object.fromEntries(record.fields.map((f) => [f, `demo_${f}`]));
  return {
    recordKey: `mongo:${scenario.id}-${slug}`,
    _id: `ObjectId("${oid}")`,
    collection: 'scenario_records',
    doc: {
      type: record.type,
      title: record.title,
      scenario: scenario.id,
      status: 'ACTIVE',
      ...fieldMap,
    },
  };
}

function buildRowsFromScenarioRecords(scenario: DemoScenario): ScenarioSeed {
  const records = scenario.records ?? [];
  const mysql: MysqlPiiRow[] = [];
  const postgres: PostgresRow[] = [];
  const mongo: MongoDocument[] = [];

  records.forEach((record, index) => {
    const engine = engineForIndex(index);
    if (engine === 'mysql') mysql.push(toMysqlRow(scenario, record, index));
    else if (engine === 'postgres') postgres.push(toPostgresRow(scenario, record, index));
    else mongo.push(toMongoDoc(scenario, record, index));
  });

  return { mysql, postgres, mongo };
}

export function getScenarioSeed(scenarioId: ScenarioId = DEFAULT_SCENARIO_ID): ScenarioSeed {
  const scenario = findScenario(scenarioId) ?? findScenario(DEFAULT_SCENARIO_ID)!;
  if (scenario.useLegacySeed) {
    return {
      mysql: MYSQL_ROWS,
      postgres: POSTGRES_ROWS,
      mongo: MONGO_DOCUMENTS,
    };
  }
  return buildRowsFromScenarioRecords(scenario);
}
