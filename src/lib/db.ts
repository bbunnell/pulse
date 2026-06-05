import { Pool, type PoolClient, type QueryResultRow } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required. Configure PostgreSQL before starting TimeBoard.");
}

declare global {
  var __timeboardPgPool: Pool | undefined;
}

const pool =
  globalThis.__timeboardPgPool ??
  new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__timeboardPgPool = pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  return pool.query<T>(text, values);
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
