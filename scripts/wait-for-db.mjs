import process from "node:process";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const maxAttempts = Number(process.env.DB_WAIT_ATTEMPTS ?? "60");
const delayMs = Number(process.env.DB_WAIT_DELAY_MS ?? "1000");

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      process.stdout.write(`Database is reachable (attempt ${attempt}).\n`);
      return;
    } catch (error) {
      await client.end().catch(() => {});
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(
        `Waiting for database... (${attempt}/${maxAttempts}) ${message}\n`,
      );
      if (attempt === maxAttempts) {
        console.error("Database did not become ready in time.");
        process.exit(1);
      }
      await sleep(delayMs);
    }
  }
}

main();
