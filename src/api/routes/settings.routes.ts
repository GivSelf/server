import type { FastifyInstance } from "fastify";
import { getAllSettingsMasked, setSettings, getSetting } from "../../services/settings.service.js";

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  // Get all settings (secrets masked)
  app.get("/api/settings", async () => {
    return getAllSettingsMasked();
  });

  // Save multiple settings at once
  app.post<{
    Body: Record<string, string>;
  }>("/api/settings", async (request) => {
    await setSettings(request.body);

    // Auto-fetch Solcast site geometry if Solcast credentials provided
    const solcastKey = request.body.solcast_api_key;
    const solcastSite = request.body.solcast_site_id;
    if (solcastKey && solcastSite) {
      try {
        const { SolcastClient } = await import("../../cloud/solcast-api.js");
        const client = new SolcastClient(solcastKey, solcastSite);
        const site = await client.getSiteInfo();
        // Only persist geometry fields that are actually valid numbers — never
        // store "undefined"/NaN, which would break the Forecast.Solar request URL.
        const geometry: Record<string, string> = {};
        const fields: [string, number][] = [
          ["forecast_latitude", site.latitude],
          ["forecast_longitude", site.longitude],
          ["forecast_tilt", site.tilt],
          ["forecast_azimuth", site.azimuth],
          ["forecast_capacity_kwp", site.capacity],
        ];
        for (const [key, val] of fields) {
          if (Number.isFinite(val)) geometry[key] = String(val);
        }
        if (Object.keys(geometry).length > 0) await setSettings(geometry);
        console.log(`[settings] Auto-fetched Solcast site geometry: ${site.latitude}, ${site.longitude}`);
      } catch (err) {
        console.warn("[settings] Failed to fetch Solcast site info:", (err as Error).message);
      }
    }

    return { saved: true };
  });

  // Check if first-run setup is needed
  app.get("/api/settings/setup-required", async () => {
    const dongleSerial = await getSetting("dongle_serial");
    return { required: !dongleSerial };
  });

  // System info — uses cloud API if configured, otherwise returns basic info
  app.get("/api/system/info", async () => {
    const geKey = await getSetting("givenergy_api_key");
    const geSerial = await getSetting("givenergy_inverter_serial");
    if (geKey && geSerial) {
      try {
        const { GivEnergyCloudClient } = await import("../../cloud/givenergy-api.js");
        const client = new GivEnergyCloudClient(geKey, geSerial);
        const dongleSerial = geSerial.replace(/^FD/, "WH");
        const info = await client.getDeviceInfo();
        return info;
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
    return { message: "GivEnergy Cloud API not configured. Add your API key in Settings." };
  });

  // Data import — creates a client from provided or stored credentials
  app.get("/api/import/status", async () => {
    // Return a default status if no import is running
    return { running: false, daysTotal: 0, daysCompleted: 0, barsImported: 0, error: null };
  });

  app.post<{
    Body: { fromDate: string; toDate: string; clear?: boolean; apiKey?: string; inverterSerial?: string };
  }>("/api/import/start", async (request) => {
    const { fromDate, toDate, clear = false, apiKey, inverterSerial } = request.body;

    // Use provided credentials or load from DB
    const key = apiKey || await getSetting("givenergy_api_key");
    const serial = inverterSerial || await getSetting("givenergy_inverter_serial");

    if (!key || !serial) {
      return { error: "GivEnergy API key and inverter serial are required. Configure them in Settings." };
    }

    const { GivEnergyCloudClient } = await import("../../cloud/givenergy-api.js");
    const { ImportService } = await import("../../services/import.service.js");
    const client = new GivEnergyCloudClient(key, serial);
    const importService = new ImportService(client);
    await importService.start(fromDate, toDate, clear);
    return importService.getStatus();
  });

  // Energy flows — derived from locally-collected metrics; cloud is a last resort
  app.get<{
    Querystring: { date?: string; grouping?: string };
  }>("/api/energy/flows", async (request) => {
    const { getOrCreateFlowsService } = await import("../../cloud/energy-flows.service.js");
    const flowsService = await getOrCreateFlowsService();
    const date = request.query.date || new Date().toISOString().split("T")[0];
    const grouping = request.query.grouping || "half-hourly";
    return flowsService.getFlows(date, grouping);
  });

  app.get<{
    Querystring: { date?: string };
  }>("/api/energy/flows/summary", async (request) => {
    const { getOrCreateFlowsService } = await import("../../cloud/energy-flows.service.js");
    const flowsService = await getOrCreateFlowsService();
    const date = request.query.date || new Date().toISOString().split("T")[0];
    return flowsService.getSummary(date);
  });

  // Solar forecast
  app.get<{
    Querystring: { date?: string };
  }>("/api/forecast/solar", async (request) => {
    try {
      const { ForecastService } = await import("../../services/forecast.service.js");
      // Use a static instance pattern — create once, reuse
      const date = request.query.date || new Date().toISOString().split("T")[0];
      const { getLatestForecastDirect } = await import("../../services/forecast.service.js");
      return getLatestForecastDirect(date);
    } catch {
      return [];
    }
  });
}
