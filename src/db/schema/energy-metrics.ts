import { pgTable, timestamp, smallint, real } from "drizzle-orm/pg-core";

export const energyMetrics = pgTable("energy_metrics", {
  time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  pvPowerW: smallint("pv_power_w"),
  batterySoc: smallint("battery_soc"),
  batteryPowerW: smallint("battery_power_w"),
  gridPowerW: smallint("grid_power_w"),
  loadPowerW: smallint("load_power_w"),
  solarToHouseW: smallint("solar_to_house_w"),
  solarToBatteryW: smallint("solar_to_battery_w"),
  solarToGridW: smallint("solar_to_grid_w"),
  batteryToHouseW: smallint("battery_to_house_w"),
  gridToHouseW: smallint("grid_to_house_w"),
  gridToBatteryW: smallint("grid_to_battery_w"),
  gridVoltageV: real("grid_voltage_v"),
  batteryVoltageV: real("battery_voltage_v"),
  batteryTempC: real("battery_temp_c"),
});
