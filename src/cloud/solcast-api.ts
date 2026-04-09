const BASE_URL = "https://api.solcast.com.au";

export interface SolcastForecastPoint {
  pv_estimate: number; // kW
  period_end: string; // ISO 8601
  period: string; // "PT30M"
}

export class SolcastClient {
  constructor(
    private readonly apiKey: string,
    private readonly siteId: string,
  ) {}

  /** Get forecast from now up to 48h ahead, half-hourly. */
  async getForecasts(hours = 48): Promise<SolcastForecastPoint[]> {
    const res = await this.request(
      `/rooftop_sites/${this.siteId}/forecasts?hours=${hours}&period=PT30M&format=json`,
    );
    return res.forecasts || [];
  }

  /** Get estimated actuals for the past up to 48h, half-hourly. */
  async getEstimatedActuals(hours = 48): Promise<SolcastForecastPoint[]> {
    const res = await this.request(
      `/rooftop_sites/${this.siteId}/estimated_actuals?hours=${hours}&period=PT30M&format=json`,
    );
    return res.estimated_actuals || [];
  }

  /** Get site info (lat, lon, tilt, azimuth, capacity). Not rate-limited against forecast quota. */
  async getSiteInfo(): Promise<SolcastSiteInfo> {
    const url = `${BASE_URL}/rooftop_sites/${this.siteId}?format=json&api_key=${this.apiKey}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Solcast API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json() as Record<string, unknown>;
    return data as unknown as SolcastSiteInfo;
  }

  private async request(path: string): Promise<Record<string, SolcastForecastPoint[]>> {
    const url = `${BASE_URL}${path}&api_key=${this.apiKey}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Solcast API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json() as Promise<Record<string, SolcastForecastPoint[]>>;
  }
}

export interface SolcastSiteInfo {
  name: string;
  resource_id: string;
  capacity: number;
  latitude: number;
  longitude: number;
  azimuth: number;
  tilt: number;
  install_date: string;
  loss_factor: number;
}
