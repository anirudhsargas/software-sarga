const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : (process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432),
  user: process.env.PG_USER || process.env.DB_USER,
  password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.PG_DATABASE || process.env.DB_NAME,
  max: process.env.PG_MAX_CLIENTS ? Number(process.env.PG_MAX_CLIENTS) : 20,
  idleTimeoutMillis: process.env.PG_IDLE_TIMEOUT_MS ? Number(process.env.PG_IDLE_TIMEOUT_MS) : 30000,
  connectionTimeoutMillis: process.env.PG_CONN_TIMEOUT_MS ? Number(process.env.PG_CONN_TIMEOUT_MS) : 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres client error', err);
});

const query = (text, params) => pool.query(text, params);
const getClient = async () => {
  const client = await pool.connect();
  const release = () => client.release();
  return { client, release };
};

module.exports = { pool, query, getClient };
