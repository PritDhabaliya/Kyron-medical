import fs from "fs/promises";
import path from "path";
import { pool } from "../models/db";

export async function bootstrapDatabase() {
  const rootDir = path.resolve(__dirname, "../../");
  const schemaPath = path.join(rootDir, "database", "schema.sql");
  const seedPath = path.join(rootDir, "database", "seed.sql");

  const schemaSql = await fs.readFile(schemaPath, "utf8");
  const seedSql = await fs.readFile(seedPath, "utf8");

  await pool.query(schemaSql);
  try {
    await pool.query(seedSql);
  } catch (error) {
    // Existing Supabase projects may already have legacy doctor rows/ids.
    // We do not want seed failures to block app startup.
    // eslint-disable-next-line no-console
    console.warn("Database seed skipped:", error);
  }
}

