export type DbEngine = 'mysql' | 'postgres' | 'mongo';

export const DB_ENGINES: { id: DbEngine; label: string; short: string }[] = [
  { id: 'mysql', label: 'MySQL', short: 'phpMyAdmin' },
  { id: 'postgres', label: 'PostgreSQL', short: 'pgAdmin' },
  { id: 'mongo', label: 'MongoDB', short: 'Compass' },
];
