import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const migrations = [
  "supabase/migrations/0000_pg_compat.sql",
  "supabase/migrations/0001_initial_schema.sql",
  "supabase/migrations/0002_internal_auth_and_settings.sql",
  "supabase/migrations/0003_bootstrap_seed.sql",
];

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. Set it in your environment or .env.local.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    for (const migrationPath of migrations) {
      const absolutePath = path.join(process.cwd(), migrationPath);
      const sql = await readFile(absolutePath, "utf8");
      process.stdout.write(`Applying ${migrationPath} ... `);
      await client.query(sql);
      process.stdout.write("done\n");
    }

    process.stdout.write("\nDatabase setup completed successfully.\n");
    process.stdout.write("Seeded admin: admin@company.local (password: ChangeMeNow123!)\n");
    process.stdout.write("Change the password immediately after first login.\n");
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("\nDatabase setup failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
