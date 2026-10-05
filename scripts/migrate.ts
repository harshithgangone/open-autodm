import { Pool } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: url,
    ssl: {
      rejectUnauthorized: true,
      ca: readFileSync(
        process.env.DATABASE_SSL_CA ?? "supabase/certs/prod-ca-2021.crt",
        "utf8",
      ),
    },
    connectionTimeoutMillis: 10000,
    max: 1,
  });
  const client = await pool.connect();
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtext('open-autodm-migrations'))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS public.open_autodm_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
   ALTER TABLE public.open_autodm_migrations ENABLE ROW LEVEL SECURITY;
   REVOKE ALL ON public.open_autodm_migrations FROM anon,authenticated;`);
    for (const file of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
      const sum = createHash("sha256").update(sql).digest("hex");
      const applied = (
        await client.query(
          "SELECT checksum FROM public.open_autodm_migrations WHERE version=$1",
          [file],
        )
      ).rows[0];
      if (applied) {
        if (applied.checksum !== sum)
          throw new Error(`Migration checksum changed: ${file}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.open_autodm_migrations(version,checksum) VALUES($1,$2)",
          [file, sum],
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
      console.log(`Applied ${file}`);
    }
    await client.query("NOTIFY pgrst, 'reload schema'");
  } finally {
    await client.query(
      "SELECT pg_advisory_unlock(hashtext('open-autodm-migrations'))",
    );
    client.release();
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Migration failed");
  process.exitCode = 1;
});
