import { pgTable, timestamp, smallint, integer, real } from "drizzle-orm/pg-core";

export const energyMetrics = pgTable("energy_metrics", {
  time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  // Power columns are INTEGER (watts): SMALLINT (max 32767) dropped rows on the
  // occasional out-of-range Modbus misread. battery_soc stays SMALLINT (0-100).
  pvPowerW: integer("pv_power_w"),
  batterySoc: smallint("battery_soc"),
  batteryPowerW: integer("battery_power_w"),
  gridPowerW: integer("grid_power_w"),
  loadPowerW: integer("load_power_w"),
  solarToHouseW: integer("solar_to_house_w"),
  solarToBatteryW: integer("solar_to_battery_w"),
  solarToGridW: integer("solar_to_grid_w"),
  batteryToHouseW: integer("battery_to_house_w"),
  gridToHouseW: integer("grid_to_house_w"),
  gridToBatteryW: integer("grid_to_battery_w"),
  gridVoltageV: real("grid_voltage_v"),
  batteryVoltageV: real("battery_voltage_v"),
  batteryTempC: real("battery_temp_c"),
});
