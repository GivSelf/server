import type { EnergyAdapter } from "../adapters/adapter.interface.js";
import { getDb } from "../db/connection.js";
import { energyMetrics } from "../db/schema/energy-metrics.js";
import { broadcast } from "../ws/channels.js";
import { config } from "../config.js";
import { sql } from "drizzle-orm";

export class DataCollectorService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tableReady = false;

  constructor(private readonly adapter: EnergyAdapter) {}

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    try {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS energy_metrics (
          time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          pv_power_w SMALLINT,
          battery_soc SMALLINT,
          battery_power_w SMALLINT,
          grid_power_w SMALLINT,
          load_power_w SMALLINT,
          solar_to_house_w SMALLINT,
          solar_to_battery_w SMALLINT,
          solar_to_grid_w SMALLINT,
          battery_to_house_w SMALLINT,
          grid_to_house_w SMALLINT,
          grid_to_battery_w SMALLINT,
          grid_voltage_v REAL,
          battery_voltage_v REAL,
          battery_temp_c REAL
        )
      `);
      try {
        await db.execute(sql`SELECT create_hypertable('energy_metrics', 'time', if_not_exists => TRUE)`);
      } catch {
        // Already a hypertable or not TimescaleDB
      }
      this.tableReady = true;
    } catch {
      // DB not available yet — will retry next poll
    }
  }

  start(): void {
    console.log(`[collector] Starting data collection every ${config.pollIntervalMs}ms`);
    this.poll(); // immediate first poll
    this.timer = setInterval(() => this.poll(), config.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    try {
      // Sequential — Modbus TCP is single-request-in-flight
      const live = await this.adapter.getLivePower();
      const energy = await this.adapter.getEnergyToday();

      // Broadcast via WebSocket (WsServerMessage oneof structure)
      broadcast({ livePower: live });
      broadcast({ liveEnergy: energy });

      // Persist to DB (non-blocking — don't let DB failure stop broadcasts)
      await this.ensureTable();
      getDb().insert(energyMetrics).values({
        pvPowerW: live.pvPowerW,
        batterySoc: live.batterySoc,
        batteryPowerW: live.batteryPowerW,
        gridPowerW: live.gridPowerW,
        loadPowerW: live.loadPowerW,
        solarToHouseW: live.flows?.solarToHouseW ?? 0,
        solarToBatteryW: live.flows?.solarToBatteryW ?? 0,
        solarToGridW: live.flows?.solarToGridW ?? 0,
        batteryToHouseW: live.flows?.batteryToHouseW ?? 0,
        gridToHouseW: live.flows?.gridToHouseW ?? 0,
        gridToBatteryW: live.flows?.gridToBatteryW ?? 0,
        gridVoltageV: live.gridVoltageV,
        batteryVoltageV: live.batteryVoltageV,
        batteryTempC: live.batteryTemperatureC,
      }).catch((err) => console.warn("[collector] DB write failed:", (err as Error).message));
    } catch (err) {
      console.error("[collector] Poll error:", (err as Error).message);
    }
  }
}
