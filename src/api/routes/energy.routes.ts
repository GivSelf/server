import type { FastifyInstance } from "fastify";
import type { EnergyAdapter } from "../../adapters/adapter.interface.js";
import { MetricsService } from "../../services/metrics.service.js";

const metricsService = new MetricsService();

export async function energyRoutes(app: FastifyInstance, adapter: EnergyAdapter): Promise<void> {
  app.get("/api/energy/today", async () => {
    return adapter.getEnergyToday();
  });

  app.get<{
    Querystring: { from?: string; to?: string; resolution?: string };
  }>("/api/energy/history", async (request) => {
    const now = new Date();
    const from = request.query.from ? new Date(request.query.from) : new Date(now.getTime() - 86_400_000);
    const to = request.query.to ? new Date(request.query.to) : now;
    const resolution = request.query.resolution === "daily" ? "daily" : "hourly";

    return metricsService.getHistory(from, to, resolution);
  });
}
