import type { FastifyInstance } from "fastify";
import type { EnergyFlowsService } from "../../cloud/energy-flows.service.js";
import type { ForecastService } from "../../services/forecast.service.js";

export async function cloudRoutes(
  app: FastifyInstance,
  flowsService: EnergyFlowsService,
  forecastService?: ForecastService | null,
): Promise<void> {
  app.get<{
    Querystring: { date?: string; grouping?: string };
  }>("/api/energy/flows", async (request) => {
    const date = request.query.date || new Date().toISOString().split("T")[0];
    const grouping = request.query.grouping || "half-hourly";
    return flowsService.getFlows(date, grouping);
  });

  app.get<{
    Querystring: { date?: string };
  }>("/api/energy/flows/summary", async (request) => {
    const date = request.query.date || new Date().toISOString().split("T")[0];
    return flowsService.getSummary(date);
  });

  // Solar forecast data
  if (forecastService) {
    app.get<{
      Querystring: { date?: string };
    }>("/api/forecast/solar", async (request) => {
      const date = request.query.date || new Date().toISOString().split("T")[0];
      return forecastService.getLatestForecast(date);
    });
  }

}
