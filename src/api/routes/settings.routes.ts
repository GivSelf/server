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
    const dongleSerial = await getSetting("dongle_serial");
    return { required: !dongleSerial };
  });
}
