import { getDb } from "../db/connection.js";
import { sql } from "drizzle-orm";

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  tableReady = true;
}

export async function getSetting(key: string): Promise<string | null> {
  try {
    await ensureTable();
    const db = getDb();
    const [row] = await db.execute(sql`SELECT value FROM app_settings WHERE key = ${key}`);
    return row ? String(row.value) : null;
  } catch {
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureTable();
  const db = getDb();
  await db.execute(sql`
    INSERT INTO app_settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = ${value}
  `);
}

export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    result[key] = await getSetting(key);
  }
  return result;
}
