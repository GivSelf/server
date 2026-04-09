import type { FastifyInstance } from "fastify";
import type { EnergyAdapter } from "../../adapters/adapter.interface.js";
import { broadcast } from "../../ws/channels.js";

export async function schedulesRoutes(app: FastifyInstance, adapter: EnergyAdapter): Promise<void> {
  app.put<{ Params: { index: string }; Body: { slot: { start: string; end: string; targetSoc: number } } }>(
    "/api/schedules/charge/:index",
    async (request) => {
      const { slot } = request.body;
      await adapter.setChargeSlot?.(parseInt(request.params.index), slot.start, slot.end, slot.targetSoc);
      const state = await adapter.getSchedules();
      broadcast({ scheduleUpdated: state });
      return state;
    },
  );

  app.put<{ Params: { index: string }; Body: { slot: { start: string; end: string; targetSoc: number } } }>(
    "/api/schedules/discharge/:index",
    async (request) => {
      const { slot } = request.body;
      await adapter.setDischargeSlot?.(parseInt(request.params.index), slot.start, slot.end, slot.targetSoc);
      const state = await adapter.getSchedules();
      broadcast({ scheduleUpdated: state });
      return state;
    },
  );

  app.put<{ Body: { mode: number } }>("/api/schedules/mode", async (request) => {
    await adapter.setBatteryMode?.(request.body.mode);
    const state = await adapter.getSchedules();
    broadcast({ scheduleUpdated: state });
    return state;
  });

  app.put<{ Body: { enabled: boolean } }>("/api/schedules/charge/enable", async (request) => {
    await adapter.enableChargeSchedule?.(request.body.enabled);
    const state = await adapter.getSchedules();
    broadcast({ scheduleUpdated: state });
    return state;
  });

  app.put<{ Body: { enabled: boolean } }>("/api/schedules/discharge/enable", async (request) => {
    await adapter.enableDischargeSchedule?.(request.body.enabled);
    const state = await adapter.getSchedules();
    broadcast({ scheduleUpdated: state });
    return state;
  });
}
