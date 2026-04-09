import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { createAdapter } from "./adapters/adapter.registry.js";
import { DataCollectorService } from "./services/data-collector.service.js";
import { registerWebSocket } from "./ws/ws-server.js";
import { liveRoutes } from "./api/routes/live.routes.js";
import { energyRoutes } from "./api/routes/energy.routes.js";
import { systemRoutes } from "./api/routes/system.routes.js";
import { controlRoutes } from "./api/routes/control.routes.js";
import { schedulesRoutes } from "./api/routes/schedules.routes.js";
import { BoostService } from "./services/boost.service.js";
import { GivEnergyCloudClient } from "./cloud/givenergy-api.js";
import { EnergyFlowsService } from "./cloud/energy-flows.service.js";
import { cloudRoutes } from "./api/routes/cloud.routes.js";
import { SolcastClient } from "./cloud/solcast-api.js";
import { ForecastSolarClient } from "./cloud/forecast-solar-api.js";
import { ForecastService } from "./services/forecast.service.js";

async function main() {
  const app = Fastify({ logger: true });

  // WebSocket support
  await app.register(websocket);

  // Create adapter
  const adapter = createAdapter();
  console.log(`[main] Using adapter: ${adapter.name}`);

  // Connect adapter
  try {
    await adapter.connect();
  } catch (err) {
    console.error(`[main] Adapter connect failed: ${(err as Error).message}`);
    console.error("[main] Server will start but data collection will fail until inverter is reachable");
  }

  // Services
  const boostService = new BoostService(adapter);

  // Cloud API (optional — DB settings first, then env fallback)
  let flowsService: EnergyFlowsService | null = null;
  let cloudClient: GivEnergyCloudClient | null = null;
  {
    const { getSetting } = await import("./services/settings.service.js");
    const dbGeKey = await getSetting("givenergy_api_key");
    const dbGeSerial = await getSetting("givenergy_inverter_serial");
    const geKey = dbGeKey || config.givenergyApiKey;
    const geSerial = dbGeSerial || config.givenergyInverterSerial;

    if (geKey && geSerial) {
      cloudClient = new GivEnergyCloudClient(geKey, geSerial);
      flowsService = new EnergyFlowsService(cloudClient);
      console.log(`[main] GivEnergy Cloud API enabled for ${geSerial}`);
    }
  }

  // Solar forecast services
  let forecastService: ForecastService | null = null;
  {
    // Load forecast params: DB first (auto-populated from Solcast), then env fallback
    const { getSetting } = await import("./services/settings.service.js");
    const fsLat = parseFloat(await getSetting("forecast_latitude") || process.env.FORECAST_LATITUDE || "51.5");
    const fsLon = parseFloat(await getSetting("forecast_longitude") || process.env.FORECAST_LONGITUDE || "-0.1");
    const fsTilt = parseFloat(await getSetting("forecast_tilt") || process.env.FORECAST_TILT || "35");
    const fsAzimuth = parseFloat(await getSetting("forecast_azimuth") || process.env.FORECAST_AZIMUTH || "180");
    const fsCapacity = parseFloat(await getSetting("forecast_capacity_kwp") || process.env.FORECAST_CAPACITY_KWP || "5");
    const fsSolarClient = new ForecastSolarClient(fsLat, fsLon, fsTilt, fsAzimuth, fsCapacity);
    console.log(`[main] Forecast.Solar: lat=${fsLat}, lon=${fsLon}, tilt=${fsTilt}, azimuth=${fsAzimuth}, capacity=${fsCapacity}kWp`);

    // Load Solcast credentials: DB first, then env fallback
    const dbSolcastKey = await getSetting("solcast_api_key");
    const dbSolcastSite = await getSetting("solcast_site_id");
    const solcastKey = dbSolcastKey || config.solcastApiKey;
    const solcastSite = dbSolcastSite || config.solcastSiteId;

    const solcastClient = solcastKey && solcastSite
      ? new SolcastClient(solcastKey, solcastSite)
      : null;

    forecastService = new ForecastService(fsSolarClient, solcastClient);
    forecastService.start();
    console.log(`[main] Forecast.Solar enabled, Solcast ${solcastClient ? "enabled" : "disabled"}`);
  }

  // CORS — must be registered before routes
  app.addHook("onRequest", (request, reply, done) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
    if (request.method === "OPTIONS") {
      reply.status(204).send();
      return;
    }
    done();
  });

  // Register routes — settings always available (even without cloud API)
  const { settingsRoutes } = await import("./api/routes/settings.routes.js");
  await settingsRoutes(app);
  await liveRoutes(app, adapter);
  await energyRoutes(app, adapter);
  await systemRoutes(app, adapter);
  await controlRoutes(app, adapter, boostService);
  await schedulesRoutes(app, adapter);
  if (flowsService) {
    await cloudRoutes(app, flowsService, forecastService);
  }
  await registerWebSocket(app);

  // Start data collection
  const collector = new DataCollectorService(adapter);
  collector.start();

  // Start server
  await app.listen({ port: config.port, host: "0.0.0.0" });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[main] Shutting down...");
    collector.stop();
    forecastService?.stop();
    await adapter.disconnect();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
