import { GivEnergyCloudClient, type EnergyFlowEntry } from "./givenergy-api.js";
import { getDb } from "../db/connection.js";
import { sql } from "drizzle-orm";

export interface FlowBar {
  start: string;
  end: string;
  pvToHome: number;
  pvToBattery: number;
  pvToGrid: number;
  gridToHome: number;
  gridToBattery: number;
  batteryToHome: number;
  batteryToGrid: number;
}

export interface FlowSummary {
  pvToHome: number;
  pvToBattery: number;
  pvToGrid: number;
  gridToHome: number;
  gridToBattery: number;
  batteryToHome: number;
  batteryToGrid: number;
  total: number;
}

const GROUPING_MAP: Record<string, number> = {
  "half-hourly": 0,
  daily: 1,
  monthly: 2,
  yearly: 3,
};

function mapCloudEntry(entry: EnergyFlowEntry): FlowBar {
  const d = entry.data;
  return {
    start: entry.start_time,
    end: entry.end_time,
    pvToHome: d["0"] || 0,
    pvToBattery: d["1"] || 0,
    pvToGrid: d["2"] || 0,
    gridToHome: d["3"] || 0,
    gridToBattery: d["4"] || 0,
    batteryToHome: d["5"] || 0,
    batteryToGrid: d["6"] || 0,
  };
}

function mapDbRow(row: Record<string, unknown>): FlowBar {
  return {
    start: String(row.start_time),
    end: String(row.end_time),
    pvToHome: Number(row.pv_to_home) || 0,
    pvToBattery: Number(row.pv_to_battery) || 0,
    pvToGrid: Number(row.pv_to_grid) || 0,
    gridToHome: Number(row.grid_to_home) || 0,
    gridToBattery: Number(row.grid_to_battery) || 0,
    batteryToHome: Number(row.battery_to_home) || 0,
    batteryToGrid: Number(row.battery_to_grid) || 0,
  };
}

/** Compute the query date range based on grouping. */
function getDateRange(date: string, grouping: string): { startDate: string; endDate: string } {
  const d = new Date(date + "T00:00:00Z"); // Force UTC
  if (grouping === "daily") {
    // Week containing the selected date (Mon-Sun)
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const start = new Date(d);
    start.setUTCDate(d.getUTCDate() + mondayOffset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 7);
    return { startDate: fmt(start), endDate: fmt(end) };
  }
  if (grouping === "monthly") {
    // Full year containing the selected date
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const end = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
    return { startDate: fmt(start), endDate: fmt(end) };
  }
  // half-hourly: single day
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  return { startDate: date, endDate: fmt(next) };
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface CacheEntry<T> {
  data: T;
  expires: number;
}

export class EnergyFlowsService {
  private cache = new Map<string, CacheEntry<FlowBar[]>>();

  constructor(private readonly client: GivEnergyCloudClient) {}

  async getFlows(date: string, grouping: string): Promise<FlowBar[]> {
    const cacheKey = `${date}:${grouping}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    // Try local DB first
    const bars = await this.queryDb(date, grouping);
    if (bars.length > 0) {
      console.log(`[flows] DB hit for ${date} (${grouping}): ${bars.length} bars`);
      this.cacheResult(cacheKey, bars, date);
      return bars;
    }

    // Fall back to cloud API
    console.log(`[flows] Cloud API fetch for ${date} (${grouping})`);
    const cloudBars = await this.fetchFromCloud(date, grouping);
    this.cacheResult(cacheKey, cloudBars, date);
    return cloudBars;
  }

  async getSummary(date: string): Promise<FlowSummary> {
    const bars = await this.getFlows(date, "half-hourly");
    const summary: FlowSummary = {
      pvToHome: 0,
      pvToBattery: 0,
      pvToGrid: 0,
      gridToHome: 0,
      gridToBattery: 0,
      batteryToHome: 0,
      batteryToGrid: 0,
      total: 0,
    };
    for (const bar of bars) {
      summary.pvToHome += bar.pvToHome;
      summary.pvToBattery += bar.pvToBattery;
      summary.pvToGrid += bar.pvToGrid;
      summary.gridToHome += bar.gridToHome;
      summary.gridToBattery += bar.gridToBattery;
      summary.batteryToHome += bar.batteryToHome;
      summary.batteryToGrid += bar.batteryToGrid;
    }
    for (const key of Object.keys(summary) as (keyof FlowSummary)[]) {
      if (key !== "total") {
        summary[key] = Math.round(summary[key] * 100) / 100;
      }
    }
    summary.total = Math.round(
      (summary.pvToHome + summary.gridToHome + summary.batteryToHome) * 100,
    ) / 100;
    return summary;
  }

  private async queryDb(date: string, grouping: string): Promise<FlowBar[]> {
    try {
      const { startDate, endDate } = getDateRange(date, grouping);
      const db = getDb();
      console.log(`[flows] DB query: ${grouping} ${startDate} → ${endDate}`);

      if (grouping === "half-hourly") {
        const rows = await db.execute(sql.raw(`
          SELECT start_time, end_time,
                 pv_to_home, pv_to_battery, pv_to_grid,
                 grid_to_home, grid_to_battery,
                 battery_to_home, battery_to_grid
          FROM energy_flows
          WHERE start_time >= '${startDate}T00:00:00Z'
            AND start_time < '${endDate}T00:00:00Z'
          ORDER BY start_time
        `));
        return rows.map((r: Record<string, unknown>) => mapDbRow(r));
      }

      // Aggregate: daily or monthly from half-hourly data
      const trunc = grouping === "monthly" ? "month" : "day";
      const interval = grouping === "monthly" ? "1 month" : "1 day";
      const rows = await db.execute(sql.raw(`
        SELECT
          date_trunc('${trunc}', start_time) AS start_time,
          date_trunc('${trunc}', start_time) + '${interval}'::interval AS end_time,
          SUM(pv_to_home) AS pv_to_home,
          SUM(pv_to_battery) AS pv_to_battery,
          SUM(pv_to_grid) AS pv_to_grid,
          SUM(grid_to_home) AS grid_to_home,
          SUM(grid_to_battery) AS grid_to_battery,
          SUM(battery_to_home) AS battery_to_home,
          SUM(battery_to_grid) AS battery_to_grid
        FROM energy_flows
        WHERE start_time >= '${startDate}T00:00:00Z'
          AND start_time < '${endDate}T00:00:00Z'
        GROUP BY date_trunc('${trunc}', start_time)
        ORDER BY 1
      `));
      return rows.map((r: Record<string, unknown>) => mapDbRow(r));
    } catch (err) {
      console.error("[flows] DB query error:", (err as Error).message);
      return [];
    }
  }

  private async fetchFromCloud(date: string, grouping: string): Promise<FlowBar[]> {
    const groupingId = GROUPING_MAP[grouping] ?? 0;
    const { startDate, endDate } = getDateRange(date, grouping);
    const entries = await this.client.getEnergyFlows(startDate, endDate, groupingId);
    return entries.map(mapCloudEntry);
  }

  private cacheResult(key: string, bars: FlowBar[], date: string): void {
    const isToday = date === new Date().toISOString().split("T")[0];
    const ttl = isToday ? 5 * 60_000 : 60 * 60_000;
    this.cache.set(key, { data: bars, expires: Date.now() + ttl });
  }
}
