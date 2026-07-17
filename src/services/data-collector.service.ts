import type { EnergyAdapter } from "../adapters/adapter.interface.js";
import type { LivePowerData } from "@givself/contracts";
import { getDb } from "../db/connection.js";
import { energyMetrics } from "../db/schema/energy-metrics.js";
import { broadcast } from "../ws/channels.js";
import { config } from "../config.js";
import { sql } from "drizzle-orm";

// Power columns that were originally SMALLINT and are widened to INTEGER.
const POWER_COLUMNS = [
  "pv_power_w", "battery_power_w", "grid_power_w", "load_power_w",
  "solar_to_house_w", "solar_to_battery_w", "solar_to_grid_w",
  "battery_to_house_w", "grid_to_house_w", "grid_to_battery_w",
];

// Absolute ceiling for any single power field — no residential system reaches
// this; a reading above it is a transient Modbus misread.
const GROSS_CEILING_W = 40000;
const DEFAULT_INVERTER_CEILING_W = 20000;

export class DataCollectorService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tableReady = false;
  private inverterCeilingW: number | null = null; // PV/battery bound (inverter-limited)
  private rejectedCount = 0;

  constructor(private readonly adapter: EnergyAdapter) {}

  private async ensureTable(): Promise<void> {
    if (this.tableReady) return;
    try {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS energy_metrics (
          time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          pv_power_w INTEGER,
          battery_soc SMALLINT,
          battery_power_w INTEGER,
          grid_power_w INTEGER,
          load_power_w INTEGER,
          solar_to_house_w INTEGER,
          solar_to_battery_w INTEGER,
          solar_to_grid_w INTEGER,
          battery_to_house_w INTEGER,
          grid_to_house_w INTEGER,
          grid_to_battery_w INTEGER,
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
      // Widen SMALLINT -> INTEGER for existing installs (metadata-only, ~ms; a
      // no-op once already INTEGER). Prevents out-of-range writes dropping rows.
      for (const col of POWER_COLUMNS) {
        try {
          await db.execute(sql.raw(`ALTER TABLE energy_metrics ALTER COLUMN ${col} TYPE INTEGER`));
        } catch {
          // best-effort — glitch rejection keeps values in range regardless
        }
      }
      this.tableReady = true;
    } catch {
      // DB not available yet — will retry next poll
    }
  }

  /** Establish a plausible bound for PV/battery power, once. Prefers the inverter
   *  rating; adapters that don't expose one (the GivEnergy Modbus adapter reports
   *  only model + serial) fall back to the configured solar capacity (kWp), which
   *  bounds both PV and battery power well. Retries each poll until it resolves. */
  private async ensureCeiling(): Promise<void> {
    if (this.inverterCeilingW !== null) return;
    try {
      const info = await this.adapter.getSystemInfo();
      let ratedW = Math.max(info.inverterMaxPowerW ?? 0, info.batteryMaxPowerW ?? 0);
      if (ratedW <= 500) {
        const { getSetting } = await import("./settings.service.js");
        const kwp = parseFloat((await getSetting("forecast_capacity_kwp")) ?? "");
        if (Number.isFinite(kwp) && kwp > 0) ratedW = kwp * 1000;
      }
      if (ratedW > 500) {
        this.inverterCeilingW = Math.round(ratedW * 2); // PV DC / transients exceed AC rating
        console.log(`[collector] PV/battery plausibility ceiling: ${this.inverterCeilingW} W`);
      }
    } catch {
      // keep trying next poll
    }
  }

  /** Reject transient Modbus misreads (e.g. a 19 kW spike on a 5 kW system). */
  private isPlausible(live: LivePowerData): boolean {
    const invCeil = this.inverterCeilingW ?? DEFAULT_INVERTER_CEILING_W;
    if ((live.pvPowerW ?? 0) > invCeil) return false;
    if (Math.abs(live.batteryPowerW ?? 0) > invCeil) return false;
    const all = [
      live.pvPowerW, live.batteryPowerW, live.gridPowerW, live.loadPowerW,
      live.flows?.solarToHouseW, live.flows?.solarToBatteryW, live.flows?.solarToGridW,
      live.flows?.batteryToHouseW, live.flows?.batteryToGridW,
      live.flows?.gridToHouseW, live.flows?.gridToBatteryW,
    ];
    return all.every((v) => v == null || Math.abs(v) <= GROSS_CEILING_W);
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

      // Drop implausible samples before they reach the live feed or the DB.
      await this.ensureCeiling();
      if (!this.isPlausible(live)) {
        this.rejectedCount++;
        if (this.rejectedCount % 25 === 1) {
          console.warn(`[collector] rejected implausible reading (pv=${live.pvPowerW}W, battery=${live.batteryPowerW}W, grid=${live.gridPowerW}W); ${this.rejectedCount} total`);
        }
        return;
      }

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
