import pg from 'pg';
import mysql from 'mysql2/promise';
import { MongoClient, type Collection } from 'mongodb';
import { mongoUrl, mysqlUrl, postgresUrl } from '../config.js';

const { Pool } = pg;

let pgPool: pg.Pool | null = null;
let mysqlPool: mysql.Pool | null = null;
let mongoClient: MongoClient | null = null;

export function getPostgresPool(): pg.Pool {
  if (!pgPool) {
    pgPool = new Pool({ connectionString: postgresUrl() });
  }
  return pgPool;
}

export function getMysqlPool(): mysql.Pool {
  if (!mysqlPool) {
    mysqlPool = mysql.createPool(mysqlUrl());
  }
  return mysqlPool;
}

export async function getMongoCollection(): Promise<Collection> {
  if (!mongoClient) {
    mongoClient = new MongoClient(mongoUrl());
    await mongoClient.connect();
  }
  return mongoClient.db('meridian_platform').collection('demo_documents');
}

export async function closeRealPools(): Promise<void> {
  await pgPool?.end().catch(() => undefined);
  pgPool = null;
  await mysqlPool?.end().catch(() => undefined);
  mysqlPool = null;
  await mongoClient?.close().catch(() => undefined);
  mongoClient = null;
}
