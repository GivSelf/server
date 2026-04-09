import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";

let _db: PostgresJsDatabase | null = null;
let _client: ReturnType<typeof postgres> | null = null;

export function getDb(): PostgresJsDatabase {
  if (!_db) {
    _client = postgres(config.databaseUrl);
    _db = drizzle(_client);
  }
  return _db;
}

export function getClient(): ReturnType<typeof postgres> | null {
  return _client;
}
