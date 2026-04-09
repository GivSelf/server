import type { FastifyInstance } from "fastify";
import type { EnergyAdapter } from "../../adapters/adapter.interface.js";

export async function systemRoutes(app: FastifyInstance, adapter: EnergyAdapter): Promise<void> {
  app.get("/api/system", async () => {
    return adapter.getSystemInfo();
  });

  app.get("/api/batteries", async () => {
    return adapter.getBatteries();
  });

  app.get("/api/schedules", async () => {
    return adapter.getSchedules();
  });
}
