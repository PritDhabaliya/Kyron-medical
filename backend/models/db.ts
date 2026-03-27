import type { QueryResultRow } from "pg";
import { Pool } from "pg";

let poolInstance: Pool | null = null;

function getPool() {
  if (!poolInstance) {
    // Supabase typically requires SSL. RejectUnauthorized=false works for managed SSL.
    poolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  }
  return poolInstance;
}

export const pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool(), prop, receiver);
  },
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  const result = await getPool().query<T>(text, params);
  return result;
}

