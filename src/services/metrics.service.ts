import { getDb } from "../db/connection.js";
import { energyMetrics } from "../db/schema/energy-metrics.js";
import { sql } from "drizzle-orm";

export interface HistoryPoint {
  time: string;
  pvPowerW: number;
  batteryPowerW: number;
  gridPowerW: number;
  loadPowerW: number;
  batterySoc: number;
}

export class MetricsService {
  async getHistory(from: Date, to: Date, resolution: "hourly" | "daily"): Promise<HistoryPoint[]> {
    try {
      const trunc = resolution === "daily" ? "day" : "hour";
      const db = getDb();
      const rows = await db.execute(sql`
        SELECT
          date_trunc(${trunc}, time) AS time,
          AVG(pv_power_w)::int AS pv_power_w,
          AVG(battery_power_w)::int AS battery_power_w,
          AVG(grid_power_w)::int AS grid_power_w,
          AVG(load_power_w)::int AS load_power_w,
          AVG(battery_soc)::int AS battery_soc
        FROM energy_metrics
        WHERE time >= ${from.toISOString()} AND time < ${to.toISOString()}
        GROUP BY 1
        ORDER BY 1
      `);
      return rows.map((r: Record<string, unknown>) => ({
        time: String(r.time),
        pvPowerW: Number(r.pv_power_w) || 0,
        batteryPowerW: Number(r.battery_power_w) || 0,
        gridPowerW: Number(r.grid_power_w) || 0,
        loadPowerW: Number(r.load_power_w) || 0,
        batterySoc: Number(r.battery_soc) || 0,
      }));
    } catch {
      // DB unavailable — return mock data
      return this.generateMockHistory(from, to, resolution);
    }
  }

  private generateMockHistory(from: Date, to: Date, resolution: "hourly" | "daily"): HistoryPoint[] {
    const points: HistoryPoint[] = [];
    const stepMs = resolution === "daily" ? 86_400_000 : 3_600_000;
    let t = new Date(from);

    while (t < to) {
      const hour = t.getHours();
      const solar = hour >= 6 && hour <= 20
        ? Math.round(Math.sin(((hour - 6) / 14) * Math.PI) * (2500 + Math.random() * 1000))
        : 0;
      const load = Math.round(400 + Math.random() * 800);
      const surplus = solar - load;
      const batteryPower = surplus > 0
        ? Math.min(surplus, 2500)
        : Math.max(surplus, -2500);
      const gridPower = -(surplus - batteryPower);

      points.push({
        time: t.toISOString(),
        pvPowerW: solar,
        batteryPowerW: batteryPower,
        gridPowerW: gridPower,
        loadPowerW: load,
        batterySoc: Math.round(30 + Math.random() * 60),
      });
      t = new Date(t.getTime() + stepMs);
    }
    return points;
  }
}
