import type { FastifyInstance } from "fastify";
import type { EnergyAdapter } from "../../adapters/adapter.interface.js";

export async function liveRoutes(app: FastifyInstance, adapter: EnergyAdapter): Promise<void> {
  app.get("/api/live", async () => {
    return adapter.getLivePower();
  });
}
