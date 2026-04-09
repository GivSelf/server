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

export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    await ensureTable();
    const db = getDb();
    const rows = await db.execute(sql`SELECT key, value FROM app_settings`);
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[String(row.key)] = String(row.value);
    }
    return result;
  } catch {
    return {};
  }
}

export async function setSettings(settings: Record<string, string>): Promise<void> {
  for (const [key, value] of Object.entries(settings)) {
    if (value !== undefined && value !== null && value !== "") {
      await setSetting(key, value);
    }
  }
}

/** Mask a secret for display — show last 4 chars */
export function maskSecret(value: string | null): string | null {
  if (!value || value.length < 8) return value ? "••••" : null;
  return "••••" + value.slice(-4);
}

const SECRET_KEYS = new Set(["givenergy_api_key", "solcast_api_key"]);

export async function getAllSettingsMasked(): Promise<Record<string, string | null>> {
  const settings = await getAllSettings();
  const result: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(settings)) {
    result[key] = SECRET_KEYS.has(key) ? maskSecret(value) : value;
  }
  return result;
}
