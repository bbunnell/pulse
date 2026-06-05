/**
 * Migration runner.
 *
 * Auto-discovers supabase/migrations/*.sql, applies any not yet recorded in the
 * `schema_migrations` table (in filename order), each inside its own transaction,
 * and records the filename + SHA-256 checksum once applied.
 *
 * Migrations MUST be idempotent (IF NOT EXISTS / ON CONFLICT / create-or-replace)
 * so the first run against a pre-existing database can safely catch up and record
 * everything without damage.
 *
 * Usage:  node --env-file-if-exists=.env.local scripts/migrate.mjs
 */
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required. Set it in your environment or .env.local.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Bootstrap the tracking table (cannot itself be a tracked migration).
    await client.query(`
      create table if not exists public.schema_migrations (
        filename    text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await client.query("select filename from public.schema_migrations")).rows.map((r) => r.filename),
    );

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort(); // 0000_, 0001_, … lexical order == apply order

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");

      process.stdout.write(`Applying ${file} ... `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "insert into public.schema_migrations (filename, checksum) values ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        process.stdout.write("done\n");
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        process.stdout.write("FAILED\n");
        throw new Error(`Migration ${file} failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (count === 0) {
      process.stdout.write("Database is up to date — no migrations to apply.\n");
    } else {
      process.stdout.write(`\nApplied ${count} migration(s). Database is up to date.\n`);
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("\nMigration failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
