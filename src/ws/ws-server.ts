import type { FastifyInstance } from "fastify";
import { addClient } from "./channels.js";

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, (socket) => {
    addClient(socket);
  });
}
