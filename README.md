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
- **Settings Persistence** — All configuration stored in database, no .env required

## Quick Start

```bash
# With Docker (recommended)
docker pull ghcr.io/givself/server:latest

# Local development
npm install
ADAPTER_TYPE=mock npx tsx src/index.ts
```

## Documentation

See [givself.github.io](https://givself.github.io) for full documentation.

## License

MIT
