export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  databaseUrl: process.env.DATABASE_URL || "postgres://givself:givself_dev@localhost:5432/givself",
  adapterType: process.env.ADAPTER_TYPE || "mock",
  inverterHost: process.env.INVERTER_HOST || "192.168.1.100",
  inverterPort: parseInt(process.env.INVERTER_PORT || "8899", 10),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "10000", 10),
  givenergyApiKey: process.env.GIVENERGY_API_KEY || "",
  givenergyInverterSerial: process.env.GIVENERGY_INVERTER_SERIAL || "",
  solcastApiKey: process.env.SOLCAST_API_KEY || "",
  solcastSiteId: process.env.SOLCAST_SITE_ID || "",
};
