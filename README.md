# GivSelf Server

Fastify backend for the GivSelf home energy management system.

![Dashboard](https://givself.github.io/images/dashboard.png)

## Features

- **Modbus TCP** — Direct communication with GivEnergy inverters over the local network
- **GivEnergy Cloud API** — Historical energy flows, system info, device details
- **Solar Forecasting** — Solcast (10 calls/day) + Forecast.Solar (free, every 30 min)
- **TimescaleDB** — Time-series storage for energy metrics, flows, and forecasts
- **WebSocket** — Real-time power data broadcast every 10 seconds
- **REST API** — Full control of schedules, boost, battery modes, rates
- **Historical Import** — Backfill years of data from GivEnergy Cloud API
- **Settings Persistence** — All configuration stored in database, no .env files required

## Deployment

### Docker (recommended)

```bash
docker pull ghcr.io/givself/server:latest
```

See the [deploy repo](https://github.com/GivSelf/deploy) for the full docker-compose.yml.

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Server listen port |
| `DATABASE_URL` | **Yes** | — | PostgreSQL/TimescaleDB connection string |
| `ADAPTER_TYPE` | No | `mock` | Inverter adapter: `givenergy` or `mock` |
| `INVERTER_HOST` | No | `192.168.1.100` | Inverter/dongle IP on local network |
| `INVERTER_PORT` | No | `8899` | Modbus TCP port |
| `POLL_INTERVAL_MS` | No | `10000` | Data collection interval (ms) |

All other settings (API keys, serials, solar panel geometry) are configured through the web UI and persisted to the database. Environment variables are not needed for:

- ~~`GIVENERGY_API_KEY`~~ → Configure in Settings UI
- ~~`GIVENERGY_INVERTER_SERIAL`~~ → Configure in Settings UI
- ~~`SOLCAST_API_KEY`~~ → Configure in Settings UI
- ~~`SOLCAST_SITE_ID`~~ → Configure in Settings UI
- ~~`FORECAST_LATITUDE/LONGITUDE/TILT/AZIMUTH`~~ → Auto-detected from Solcast site

These can still be passed as env vars for backward compatibility, but the UI settings take priority.

### UI-Configurable Settings (persisted to database)

On first launch, a setup wizard guides you through:

1. **Inverter Connection** — Dongle serial, inverter IP
2. **GivEnergy Cloud** — API key, inverter serial (for historical data + system info)
3. **Solar Forecasting** — Solcast API key + site ID (panel geometry auto-detected)

All settings survive container restarts.

## Local Development

```bash
# Install dependencies
npm install

# Run with mock adapter (no hardware needed)
ADAPTER_TYPE=mock DATABASE_URL=postgres://givself:givself_dev@localhost:5433/givself npx tsx src/index.ts

# Run with real inverter
ADAPTER_TYPE=givenergy INVERTER_HOST=192.168.1.100 DATABASE_URL=postgres://givself:givself_dev@localhost:5433/givself npx tsx src/index.ts
```

## API Endpoints

### Live Data
- `GET /api/live` — Current power readings
- `GET /api/energy/today` — Today's energy totals
- `WS /ws` — Real-time WebSocket updates

### Analytics
- `GET /api/energy/flows?date=YYYY-MM-DD&grouping=half-hourly|daily|monthly`
- `GET /api/energy/flows/summary?date=YYYY-MM-DD`
- `GET /api/forecast/solar?date=YYYY-MM-DD`

### Control
- `POST /api/control/charge-rate` — `{ percent }`
- `POST /api/control/discharge-rate` — `{ percent }`
- `POST /api/control/reserve` — `{ socPercent }`
- `POST /api/control/target` — `{ socPercent }`
- `POST /api/control/boost/charge` — `{ durationMinutes }`
- `POST /api/control/boost/export` — `{ durationMinutes }`
- `POST /api/control/boost/cancel`

### Schedules
- `GET /api/schedules`
- `PUT /api/schedules/mode` — `{ mode }` (1=ECO, 2=Timed Demand, 3=Timed Export)
- `PUT /api/schedules/charge/:index` — `{ slot: { start, end, targetSoc } }`
- `PUT /api/schedules/discharge/:index`
- `PUT /api/schedules/charge/enable` — `{ enabled }`
- `PUT /api/schedules/discharge/enable` — `{ enabled }`

### Settings
- `GET /api/settings` — All settings (secrets masked)
- `POST /api/settings` — Save key-value pairs
- `GET /api/settings/setup-required` — Check if first-run wizard needed
- `GET /api/system/info` — Inverter/battery system info
- `POST /api/import/start` — Start historical data import

## License

MIT
