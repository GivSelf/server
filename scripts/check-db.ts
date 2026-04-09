import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
  const rows = await sql`SELECT start_time, end_time FROM energy_flows ORDER BY start_time LIMIT 3`;
  console.log("First 3 rows:", JSON.stringify(rows, null, 2));

  const count = await sql`SELECT COUNT(*) as count FROM energy_flows WHERE start_time >= '2026-03-31'::date AND start_time < '2026-04-01'::date`;
  console.log("March 31 count:", count[0].count);

  await sql.end();
}

main();
