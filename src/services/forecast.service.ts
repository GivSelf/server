import { SolcastClient } from "../cloud/solcast-api.js";
import { ForecastSolarClient } from "../cloud/forecast-solar-api.js";
import { getDb } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface ForecastPoint {
  periodEnd: string;
  pvEstimateKw: number;
  source: string;
}

export class ForecastService {
  private fsSolarTimer: ReturnType<typeof setInterval> | null = null;
  private solcastTimer: ReturnType<typeof setInterval> | null = null;
  private tableReady = false;

  constructor(
    private readonly forecastSolar: ForecastSolarClient | null,
    private readonly solcast: SolcastClient | null,
  ) {}

  start(): void {
    // Forecast.Solar: every 30 minutes (uses ~48 of 288 daily free calls)
    if (this.forecastSolar) {
      console.log("[forecast] Starting Forecast.Solar polling every 30 minutes");
      this.pollForecastSolar();
      this.fsSolarTimer = setInterval(() => this.pollForecastSolar(), 30 * 60_000);
    }

    // Solcast: every 6 hours (uses 8 of 10 daily free calls)
    if (this.solcast) {
      console.log("[forecast] Starting Solcast polling every 6 hours");
      this.pollSolcast();
      this.solcastTimer = setInterval(() => this.pollSolcast(), 6 * 60 * 60_000);
    }
  }

  stop(): void {
    if (this.fsSolarTimer) { clearInterval(this.fsSolarTimer); this.fsSolarTimer = null; }
    if (this.solcastTimer) { clearInterval(this.solcastTimer); this.solcastTimer = null; }
  }

  async pollForecastSolar(): Promise<void> {
    try {
      await this.ensureTable();
      const fetchedAt = new Date().toISOString();
      const { points, rateLimit } = await this.forecastSolar!.getEstimate();

      const rows = points.map((p) => ({
        fetched_at: fetchedAt,
        period_end: p.time,
        pv_estimate_kw: p.wattsAvg / 1000, // convert W to kW
        source: "forecast.solar",
      }));

      await this.insertRows(rows);
      console.log(`[forecast] Forecast.Solar: ${rows.length} points stored (rate limit: ${rateLimit.remaining}/${rateLimit.limit})`);
    } catch (err) {
      console.error("[forecast] Forecast.Solar error:", (err as Error).message);
    }
  }

  async pollSolcast(): Promise<void> {
    try {
      await this.ensureTable();
      const fetchedAt = new Date().toISOString();

      const [forecasts, actuals] = await Promise.all([
        this.solcast!.getForecasts(48),
        this.solcast!.getEstimatedActuals(48),
      ]);

      const rows = [
        ...forecasts.map((f) => ({
          fetched_at: fetchedAt,
          period_end: f.period_end,
          pv_estimate_kw: f.pv_estimate,
          source: "solcast",
        })),
        ...actuals.map((a) => ({
          fetched_at: fetchedAt,
          period_end: a.period_end,
          pv_estimate_kw: a.pv_estimate,
          source: "solcast",
        })),
      ];

      await this.insertRows(rows);
      console.log(`[forecast] Solcast: ${rows.length} points stored (${forecasts.length} forecast + ${actuals.length} actuals)`);
    } catch (err) {
      console.error("[forecast] Solcast error:", (err as Error).message);
    }
  }

  /** Get the latest forecast for a date, preferring the most recent fetch from any source. */
  async getLatestForecast(date: string): Promise<ForecastPoint[]> {
    try {
      await this.ensureTable();
      const nextDay = new Date(date + "T00:00:00Z");
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDateStr = nextDay.toISOString().split("T")[0];

      const db = getDb();

      // Get forecast points for the requested date from the most recent fetch that covers it
      const rows = await db.execute(sql`
        SELECT period_end, pv_estimate_kw, source
        FROM solar_forecasts
        WHERE fetched_at = (
          SELECT MAX(fetched_at) FROM solar_forecasts
          WHERE period_end >= ${date}::timestamptz
            AND period_end < ${nextDateStr}::timestamptz
        )
          AND period_end >= ${date}::timestamptz
          AND period_end < ${nextDateStr}::timestamptz
        ORDER BY period_end
      `);

      return rows.map((r: Record<string, unknown>) => ({
        periodEnd: String(r.period_end),
        pvEstimateKw: Number(r.pv_estimate_kw),
        source: String(r.source || "unknown"),
      }));
    } catch (err) {
      console.error("[forecast] Query error:", (err as Error).message);
      return [];
    }
  }

  private async insertRows(rows: { fetched_at: string; period_end: string; pv_estimate_kw: number; source: string }[]): Promise<void> {
    if (rows.length === 0) return;
    const db = getDb();
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const values = batch
        .map((r) => `('${r.fetched_at}', '${r.period_end}', ${r.pv_estimate_kw}, '${r.source}')`)
        .join(",");
      await db.execute(sql.raw(
        `INSERT INTO solar_forecasts (fetched_at, period_end, pv_estimate_kw, source) VALUES ${values}`
      ));
    }
  }

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS solar_forecasts (
        fetched_at TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        pv_estimate_kw REAL NOT NULL,
        source TEXT NOT NULL DEFAULT 'unknown'
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS solar_forecasts_period_end_idx ON solar_forecasts (period_end)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS solar_forecasts_fetched_at_idx ON solar_forecasts (fetched_at)`);
    // Add source column if table existed without it
    await db.execute(sql`ALTER TABLE solar_forecasts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown'`);
    this.tableReady = true;
  }
}
