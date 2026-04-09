import { pgTable, date, real } from "drizzle-orm/pg-core";

export const energyDailyTotals = pgTable("energy_daily_totals", {
  date: date("date").notNull().primaryKey(),
  pvGenerationKwh: real("pv_generation_kwh"),
  gridImportKwh: real("grid_import_kwh"),
  gridExportKwh: real("grid_export_kwh"),
  batteryChargeKwh: real("battery_charge_kwh"),
  batteryDischargeKwh: real("battery_discharge_kwh"),
  consumptionKwh: real("consumption_kwh"),
  selfConsumptionKwh: real("self_consumption_kwh"),
});
