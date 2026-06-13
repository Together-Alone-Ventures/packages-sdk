import { seedRealDatabases } from '../db/seed.js';

const counts = await seedRealDatabases();
console.log(`Seeded demo databases: mysql=${counts.mysql} postgres=${counts.postgres} mongo=${counts.mongo}`);
