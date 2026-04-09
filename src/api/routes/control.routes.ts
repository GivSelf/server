import type { FastifyInstance } from "fastify";
import type { EnergyAdapter } from "../../adapters/adapter.interface.js";
import type { BoostService } from "../../services/boost.service.js";

export async function controlRoutes(
  app: FastifyInstance,
  adapter: EnergyAdapter,
  boostService: BoostService,
): Promise<void> {
  app.get("/api/control/boost", async () => {
    return boostService.state;
  });

  app.post<{ Body: { percent: number } }>("/api/control/charge-rate", async (request) => {
    await adapter.setChargeRate?.(request.body.percent);
    return {};
  });

  app.post<{ Body: { percent: number } }>("/api/control/discharge-rate", async (request) => {
    await adapter.setDischargeRate?.(request.body.percent);
    return {};
  });

  app.post<{ Body: { socPercent: number } }>("/api/control/reserve", async (request) => {
    await adapter.setBatteryReserve?.(request.body.socPercent);
    return {};
  });

  app.post<{ Body: { socPercent: number } }>("/api/control/target", async (request) => {
    await adapter.setChargeTarget?.(request.body.socPercent);
    return {};
  });

  app.post<{ Body: { durationMinutes: number } }>("/api/control/boost/charge", async (request) => {
    await boostService.startForceCharge(request.body.durationMinutes);
    return boostService.state;
  });

  app.post<{ Body: { durationMinutes: number } }>("/api/control/boost/export", async (request) => {
    await boostService.startForceExport(request.body.durationMinutes);
    return boostService.state;
  });

  app.post("/api/control/boost/cancel", async () => {
    await boostService.cancel();
    return {};
  });

  app.post("/api/control/reboot", async () => {
    await adapter.reboot?.();
    return {};
  });

  app.post("/api/control/sync-time", async () => {
    await adapter.syncTime?.();
    return {};
  });
}
