/**
 * Import historical energy flow data from GivEnergy Cloud API into TimescaleDB.
 *
 * Usage:
 *   npx tsx scripts/import-history.ts [--days N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--clear]
 *
 * Options:
 *   --days N          Import the last N days (default: 30)
 *   --from YYYY-MM-DD Start date (overrides --days)
 *   --to YYYY-MM-DD   End date (default: today)
 *   --clear           Drop and recreate the energy_flows table before importing
 *
 * Requires .env with GIVENERGY_API_KEY, GIVENERGY_INVERTER_SERIAL, DATABASE_URL
 */

import postgres from "postgres";
import { GivEnergyCloudClient } from "../src/cloud/givenergy-api.js";

// Parse args
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}
const shouldClear = args.includes("--clear");

// Config from env
const apiKey = process.env.GIVENERGY_API_KEY;
const serial = process.env.GIVENERGY_INVERTER_SERIAL;
const dbUrl = process.env.DATABASE_URL;

if (!apiKey || !serial) {
  console.error("Missing GIVENERGY_API_KEY or GIVENERGY_INVERTER_SERIAL in environment");
  process.exit(1);
}
if (!dbUrl) {
  console.error("Missing DATABASE_URL in environment");
  process.exit(1);
}

// Date range
const toDateStr = getArg("to") || new Date().toISOString().split("T")[0];
let fromDateStr: string;
if (getArg("from")) {
  fromDateStr = getArg("from")!;
} else {
  const days = parseInt(getArg("days") || "30", 10);
  const from = new Date(toDateStr);
  from.setDate(from.getDate() - days);
  fromDateStr = from.toISOString().split("T")[0];
}

console.log(`\nGivself History Import`);
console.log(`=====================`);
console.log(`Inverter: ${serial}`);
console.log(`Range:    ${fromDateStr} → ${toDateStr}`);
console.log(`Database: ${dbUrl.replace(/:[^@]+@/, ":***@")}`);
console.log();

// Connect to DB
const sql = postgres(dbUrl);

async function main() {
  // Create table if not exists
  await sql`
    CREATE TABLE IF NOT EXISTS energy_flows (
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      pv_to_home REAL NOT NULL DEFAULT 0,
      pv_to_battery REAL NOT NULL DEFAULT 0,
      pv_to_grid REAL NOT NULL DEFAULT 0,
      grid_to_home REAL NOT NULL DEFAULT 0,
      grid_to_battery REAL NOT NULL DEFAULT 0,
      battery_to_home REAL NOT NULL DEFAULT 0,
      battery_to_grid REAL NOT NULL DEFAULT 0
    )
  `;

  // Create index if not exists
  await sql`CREATE INDEX IF NOT EXISTS energy_flows_start_time_idx ON energy_flows (start_time)`;

  // Convert to hypertable (TimescaleDB) — ignore error if already a hypertable
  try {
    await sql`SELECT create_hypertable('energy_flows', 'start_time', if_not_exists => TRUE)`;
    console.log("✓ energy_flows hypertable ready");
  } catch (err) {
    console.log("✓ energy_flows table ready (hypertable may already exist)");
  }

  if (shouldClear) {
    await sql`TRUNCATE energy_flows`;
    console.log("✓ Cleared existing data");
  }

  // Iterate through dates
  const client = new GivEnergyCloudClient(apiKey!, serial!);
  const from = new Date(fromDateStr);
  const to = new Date(toDateStr);
  let totalBars = 0;
  let dayCount = 0;

  const current = new Date(from);
  while (current <= to) {
    const dateStr = current.toISOString().split("T")[0];
    const nextDay = new Date(current);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateStr = nextDay.toISOString().split("T")[0];

    process.stdout.write(`  ${dateStr} ... `);

    try {
      const entries = await client.getEnergyFlows(dateStr, nextDateStr, 0); // half-hourly

      if (entries.length > 0) {
        // Delete existing data for this date range to avoid duplicates
        await sql`
          DELETE FROM energy_flows
          WHERE start_time >= ${dateStr}::timestamptz
            AND start_time < ${nextDateStr}::timestamptz
        `;

        // Batch insert
        const rows = entries.map((e) => ({
          start_time: e.start_time,
          end_time: e.end_time,
          pv_to_home: e.data["0"] || 0,
          pv_to_battery: e.data["1"] || 0,
          pv_to_grid: e.data["2"] || 0,
          grid_to_home: e.data["3"] || 0,
          grid_to_battery: e.data["4"] || 0,
          battery_to_home: e.data["5"] || 0,
          battery_to_grid: e.data["6"] || 0,
        }));

        await sql`INSERT INTO energy_flows ${sql(rows)}`;
        totalBars += entries.length;
        console.log(`${entries.length} bars`);
      } else {
        console.log("no data");
      }
    } catch (err) {
      console.log(`ERROR: ${(err as Error).message}`);
    }

    dayCount++;
    current.setDate(current.getDate() + 1);
  }

  console.log();
  console.log(`✓ Import complete: ${totalBars} bars across ${dayCount} days`);

  // Verify
  const [{ count }] = await sql`SELECT COUNT(*) as count FROM energy_flows`;
  console.log(`✓ Total rows in energy_flows: ${count}`);

  await sql.end();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
