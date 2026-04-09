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

  // === General Settings API ===

  // Get all settings (secrets masked)
  app.get("/api/settings", async () => {
    const { getAllSettingsMasked } = await import("../../services/settings.service.js");
    return getAllSettingsMasked();
  });

  // Save multiple settings at once
  app.post<{
    Body: Record<string, string>;
  }>("/api/settings", async (request) => {
    const { setSettings } = await import("../../services/settings.service.js");
    await setSettings(request.body);

    // Auto-fetch Solcast site geometry if Solcast credentials provided
    const solcastKey = request.body.solcast_api_key;
    const solcastSite = request.body.solcast_site_id;
    if (solcastKey && solcastSite) {
      try {
        const { SolcastClient } = await import("../../cloud/solcast-api.js");
        const client = new SolcastClient(solcastKey, solcastSite);
        const site = await client.getSiteInfo();
        await setSettings({
          forecast_latitude: String(site.latitude),
          forecast_longitude: String(site.longitude),
          forecast_tilt: String(site.tilt),
          forecast_azimuth: String(site.azimuth),
          forecast_capacity_kwp: String(site.capacity),
        });
        console.log(`[settings] Auto-fetched Solcast site geometry: ${site.latitude}, ${site.longitude}`);
      } catch (err) {
        console.warn("[settings] Failed to fetch Solcast site info:", (err as Error).message);
      }
    }

    return { saved: true };
  });

  // Check if first-run setup is needed
  app.get("/api/settings/setup-required", async () => {
    const { getSetting } = await import("../../services/settings.service.js");
    const dongleSerial = await getSetting("dongle_serial");
    return { required: !dongleSerial };
  });
}
