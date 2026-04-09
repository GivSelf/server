import { GivEnergyCloudClient } from "../cloud/givenergy-api.js";
import { getDb } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { broadcast } from "../ws/channels.js";

export interface ImportStatus {
  running: boolean;
  fromDate: string;
  toDate: string;
  currentDate: string;
  daysTotal: number;
  daysCompleted: number;
  barsImported: number;
  error: string | null;
}

export class ImportService {
  private status: ImportStatus = {
    running: false,
    fromDate: "",
    toDate: "",
    currentDate: "",
    daysTotal: 0,
    daysCompleted: 0,
    barsImported: 0,
    error: null,
  };

  constructor(private readonly client: GivEnergyCloudClient) {}

  getStatus(): ImportStatus {
    return { ...this.status };
  }

  async start(fromDate: string, toDate: string, clear: boolean, apiKey?: string, inverterSerial?: string): Promise<void> {
    if (this.status.running) {
      throw new Error("Import already in progress");
    }

    // Use provided credentials or fall back to the default client
    const client = (apiKey && inverterSerial)
      ? new GivEnergyCloudClient(apiKey, inverterSerial)
      : this.client;

    this.status = {
      running: true,
      fromDate,
      toDate,
      currentDate: fromDate,
      daysTotal: this.countDays(fromDate, toDate),
      daysCompleted: 0,
      barsImported: 0,
      error: null,
    };
    this.broadcastStatus();

    // Run in background — don't await
    this.runImport(fromDate, toDate, clear, client).catch((err) => {
      this.status.error = (err as Error).message;
      this.status.running = false;
      this.broadcastStatus();
    });
  }

  private async runImport(fromDate: string, toDate: string, clear: boolean, client: GivEnergyCloudClient = this.client): Promise<void> {
    const db = getDb();

    // Ensure table exists
    await db.execute(sql`
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
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS energy_flows_start_time_idx ON energy_flows (start_time)`);

    try {
      await db.execute(sql`SELECT create_hypertable('energy_flows', 'start_time', if_not_exists => TRUE)`);
    } catch {
      // Already a hypertable
    }

    if (clear) {
      await db.execute(sql`TRUNCATE energy_flows`);
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const current = new Date(from);

    while (current <= to) {
      const dateStr = current.toISOString().split("T")[0];
      const nextDay = new Date(current);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDateStr = nextDay.toISOString().split("T")[0];

      this.status.currentDate = dateStr;

      try {
        const entries = await client.getEnergyFlows(dateStr, nextDateStr, 0);

        if (entries.length > 0) {
          // Delete existing for this date
          await db.execute(sql.raw(
            `DELETE FROM energy_flows WHERE start_time >= '${dateStr}'::timestamptz AND start_time < '${nextDateStr}'::timestamptz`
          ));

          // Insert
          const values = entries
            .map((e) => `('${e.start_time}', '${e.end_time}', ${e.data["0"] || 0}, ${e.data["1"] || 0}, ${e.data["2"] || 0}, ${e.data["3"] || 0}, ${e.data["4"] || 0}, ${e.data["5"] || 0}, ${e.data["6"] || 0})`)
            .join(",");
          await db.execute(sql.raw(
            `INSERT INTO energy_flows (start_time, end_time, pv_to_home, pv_to_battery, pv_to_grid, grid_to_home, grid_to_battery, battery_to_home, battery_to_grid) VALUES ${values}`
          ));

          this.status.barsImported += entries.length;
        }
      } catch (err) {
        console.error(`[import] Error on ${dateStr}:`, (err as Error).message);
        // Continue to next day
      }

      this.status.daysCompleted++;
      this.broadcastStatus();

      current.setDate(current.getDate() + 1);
    }

    this.status.running = false;
    this.broadcastStatus();
  }

  private countDays(from: string, to: string): number {
    const f = new Date(from);
    const t = new Date(to);
    return Math.ceil((t.getTime() - f.getTime()) / 86_400_000) + 1;
  }

  private broadcastStatus(): void {
    broadcast({ importStatus: this.status });
  }
}
