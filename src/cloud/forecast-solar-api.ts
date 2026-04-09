/**
 * Forecast.Solar API client.
 * Free tier: 12 requests/hour, no auth required.
 * Returns hourly PV power estimates for today + tomorrow.
 *
 * API: GET https://api.forecast.solar/estimate/{lat}/{lon}/{dec}/{az}/{kwp}
 * - dec = tilt/declination in degrees
 * - az = azimuth (0=north, 180=south) — Forecast.Solar uses 0=south, so we convert
 * - kwp = capacity in kWp
 */

const BASE_URL = "https://api.forecast.solar";

export interface ForecastSolarResponse {
  result: {
    watts: Record<string, number>; // "2026-04-02 12:00:00" → watts
    watt_hours_period: Record<string, number>; // energy per period
    watt_hours_day: Record<string, number>; // daily total Wh
  };
  message: {
    ratelimit: {
      limit: number;
      remaining: number;
      period: number;
    };
  };
}

export interface ForecastSolarPoint {
  time: string; // ISO 8601
  wattsAvg: number; // average watts for the hour
  whPeriod: number; // watt-hours for the period
}

export class ForecastSolarClient {
  constructor(
    private readonly latitude: number,
    private readonly longitude: number,
    private readonly tilt: number,
    private readonly azimuth: number, // GivEnergy convention: 180 = south
    private readonly capacityKwp: number,
  ) {}

  async getEstimate(): Promise<{ points: ForecastSolarPoint[]; rateLimit: { remaining: number; limit: number } }> {
    // Forecast.Solar azimuth: -180 to 180, where 0 = south, -90 = east, 90 = west
    // GivEnergy azimuth: 0 = north, 180 = south
    // Convert: forecastSolar = givenergyAzimuth - 180
    const fsAzimuth = this.azimuth - 180;

    const url = `${BASE_URL}/estimate/${this.latitude}/${this.longitude}/${this.tilt}/${fsAzimuth}/${this.capacityKwp}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Forecast.Solar ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as ForecastSolarResponse;

    // Convert watts map to points array
    const points: ForecastSolarPoint[] = [];
    const watts = data.result.watts;
    const whPeriod = data.result.watt_hours_period;
    const times = Object.keys(watts);

    for (const time of times) {
      // Convert "2026-04-02 12:00:00" or "2026-04-02 06:31:54" to ISO
      const isoTime = time.replace(" ", "T");
      points.push({
        time: isoTime,
        wattsAvg: watts[time],
        whPeriod: whPeriod[time] || 0,
      });
    }

    return {
      points,
      rateLimit: {
        remaining: data.message.ratelimit.remaining,
        limit: data.message.ratelimit.limit,
      },
    };
  }
}
