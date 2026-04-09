import { pgTable, timestamp, real, index } from "drizzle-orm/pg-core";

export const energyFlows = pgTable("energy_flows", {
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  pvToHome: real("pv_to_home").notNull().default(0),
  pvToBattery: real("pv_to_battery").notNull().default(0),
  pvToGrid: real("pv_to_grid").notNull().default(0),
  gridToHome: real("grid_to_home").notNull().default(0),
  gridToBattery: real("grid_to_battery").notNull().default(0),
  batteryToHome: real("battery_to_home").notNull().default(0),
  batteryToGrid: real("battery_to_grid").notNull().default(0),
}, (table) => [
  index("energy_flows_start_time_idx").on(table.startTime),
]);
