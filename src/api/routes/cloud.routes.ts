import type { FastifyInstance } from "fastify";
import type { EnergyFlowsService } from "../../cloud/energy-flows.service.js";
import type { GivEnergyCloudClient } from "../../cloud/givenergy-api.js";
import type { ForecastService } from "../../services/forecast.service.js";
import type { ImportService } from "../../services/import.service.js";

export async function cloudRoutes(
  app: FastifyInstance,
  flowsService: EnergyFlowsService,
  cloudClient: GivEnergyCloudClient,
  forecastService?: ForecastService | null,
  importService?: ImportService | null,
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

  // System info from cloud API — much richer than local Modbus reads
  let cachedDeviceInfo: { data: Record<string, unknown>; expires: number } | null = null;

  app.get("/api/system/info", async () => {
    if (cachedDeviceInfo && cachedDeviceInfo.expires > Date.now()) {
      return cachedDeviceInfo.data;
    }
    const info = await cloudClient.getDeviceInfo();
    cachedDeviceInfo = { data: info, expires: Date.now() + 60 * 60_000 }; // cache 1 hour
    return info;
  });

  // Data import from GivEnergy Cloud API
  if (importService) {
    app.get("/api/import/status", async () => {
      return importService.getStatus();
    });

    app.post<{
      Body: { fromDate: string; toDate: string; clear?: boolean; apiKey?: string; inverterSerial?: string };
    }>("/api/import/start", async (request) => {
      const { fromDate, toDate, clear = false, apiKey, inverterSerial } = request.body;
      await importService.start(fromDate, toDate, clear, apiKey, inverterSerial);
      return importService.getStatus();
    });
  }

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
