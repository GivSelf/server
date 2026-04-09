const BASE_URL = "https://api.givenergy.cloud/v1";
const MIN_REQUEST_INTERVAL_MS = 1000;

export interface EnergyFlowEntry {
  start_time: string;
  end_time: string;
  data: Record<string, number>;
}

export interface DataPointSnapshot {
  time: string;
  status: string;
  power: {
    solar: { power: number; arrays: { array: number; voltage: number; current: number; power: number }[] };
    grid: { voltage: number; current: number; power: number; frequency: number };
    battery: { percent: number; power: number; temperature: number };
    consumption: { power: number };
    inverter: { temperature: number; power: number; output_voltage: number; output_frequency: number; eps_power: number };
  };
  today: {
    solar: number;
    grid: { import: number; export: number };
    battery: { charge: number; discharge: number };
    consumption: number;
    ac_charge: number;
  };
  total: {
    solar: number;
    grid: { import: number; export: number };
    battery: { charge: number; discharge: number };
    consumption: number;
    ac_charge: number;
  };
}

export class GivEnergyCloudClient {
  private lastRequestTime = 0;

  constructor(
    private readonly apiKey: string,
    private readonly inverterSerial: string,
  ) {}

  async getEnergyFlows(
    startDate: string,
    endDate: string,
    grouping: number,
    types?: number[],
  ): Promise<EnergyFlowEntry[]> {
    const body: Record<string, unknown> = {
      start_time: startDate,
      end_time: endDate,
      grouping,
    };
    if (types) body.types = types;

    const res = await this.request<{ data: Record<string, EnergyFlowEntry> }>(
      `/inverter/${this.inverterSerial}/energy-flows`,
      { method: "POST", body },
    );

    // Response data is keyed by index ("0", "1", ...), convert to array
    return Object.values(res.data);
  }

  async getDataPoints(
    date: string,
    page = 1,
    pageSize = 50,
  ): Promise<{ data: DataPointSnapshot[]; meta: { current_page: number; last_page: number; total: number } }> {
    return this.request(`/inverter/${this.inverterSerial}/data-points/${date}?page=${page}&pageSize=${pageSize}`);
  }

  async getLatestSystemData(): Promise<{ data: Record<string, unknown> }> {
    return this.request(`/inverter/${this.inverterSerial}/system-data/latest`);
  }

  /** Get full inverter + battery + dongle info via the communication device endpoint. */
  async getDeviceInfo(): Promise<Record<string, unknown>> {
    const dongleSerial = this.inverterSerial.replace(/^FD/, "WH"); // dongle serial uses WH prefix
    const res = await this.request<{ data: Record<string, unknown> }>(`/communication-device/${dongleSerial}`);
    return res.data;
  }

  private async request<T>(path: string, options?: { method?: string; body?: unknown }): Promise<T> {
    // Rate limiting
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < MIN_REQUEST_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, MIN_REQUEST_INTERVAL_MS - elapsed));
    }
    this.lastRequestTime = Date.now();

    const url = `${BASE_URL}${path}`;
    const res = await fetch(url, {
      method: options?.method || "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GivEnergy API ${res.status}: ${text.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }
}
