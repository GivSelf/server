import { pgTable, timestamp, real, index } from "drizzle-orm/pg-core";

export const solarForecasts = pgTable("solar_forecasts", {
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(), // when we fetched this forecast
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(), // the forecasted period end time
  pvEstimateKw: real("pv_estimate_kw").notNull(), // forecasted PV output in kW
}, (table) => [
  index("solar_forecasts_period_end_idx").on(table.periodEnd),
  index("solar_forecasts_fetched_at_idx").on(table.fetchedAt),
]);
