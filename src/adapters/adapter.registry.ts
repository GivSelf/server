import type { EnergyAdapter } from "./adapter.interface.js";
import { MockAdapter } from "./mock/mock.adapter.js";
import { GivEnergyAdapter } from "./givenergy/givenergy.adapter.js";
import { config } from "../config.js";

const adapters: Record<string, () => EnergyAdapter> = {
  mock: () => new MockAdapter(),
  givenergy: () => new GivEnergyAdapter(config.inverterHost, config.inverterPort),
};

export function createAdapter(): EnergyAdapter {
  const factory = adapters[config.adapterType];
  if (!factory) {
    throw new Error(`Unknown adapter type: ${config.adapterType}. Available: ${Object.keys(adapters).join(", ")}`);
  }
  return factory();
}
