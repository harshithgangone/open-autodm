import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Pool } from "pg";
import type { TransportStore } from "../src/lib/transport/store";

export async function listen(server: Server) {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
export async function body(req: IncomingMessage) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString();
}
export function json(res: ServerResponse, value: unknown, status = 200) {
  res
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify(value));
}
const ident = (s: string) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("bad_identifier");
  return `"${s}"`;
};
export async function databaseFixture() {
  const bin = process.env.TEST_PG_BIN ?? "/opt/homebrew/opt/postgresql@16/bin";
  const dir = mkdtempSync(join(tmpdir(), "bot-transport-test-"));
  const temp = createServer();
  const url = await listen(temp);
  const port = new URL(url).port;
  await new Promise<void>((r) => temp.close(() => r()));
  execFileSync(
    join(bin, "initdb"),
    ["-D", join(dir, "data"), "-A", "trust", "-U", "postgres", "--no-locale"],
    { stdio: "ignore" },
  );
  execFileSync(
    join(bin, "pg_ctl"),
    [
      "-D",
      join(dir, "data"),
      "-l",
      join(dir, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${port} -k ${dir}`,
      "-w",
      "start",
    ],
    { stdio: "ignore" },
  );
  const pool = new Pool({
    host: "127.0.0.1",
    port: Number(port),
    user: "postgres",
    database: "postgres",
  });
  try {
    await pool.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
   CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_user_meta_data jsonb DEFAULT '{}');
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';
   CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   CREATE TABLE storage.objects(id uuid,bucket_id text);`);
    for (const f of readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pool.query(readFileSync(join("supabase/migrations", f), "utf8"));
  } catch (e) {
    await pool.end();
    execFileSync(
      join(bin, "pg_ctl"),
      ["-D", join(dir, "data"), "-m", "immediate", "stop"],
      { stdio: "ignore" },
    );
    rmSync(dir, { recursive: true });
    throw e;
  }
  const store: TransportStore = {
    async rpc<T>(name: string, args: Record<string, unknown> = {}) {
      const keys = Object.keys(args),
        values = Object.values(args);
      const call = `public.${ident(name)}(${keys.map((k, i) => `${ident(k)}=>$${i + 1}`).join(",")})`;
      if (name === "transport_claim")
        return (
          await pool.query(`SELECT to_jsonb(x) value FROM ${call} x`, values)
        ).rows.map((r) => r.value) as T;
      return (await pool.query(`SELECT to_jsonb(${call}) value`, values))
        .rows[0]?.value as T;
    },
  };
  return {
    pool,
    store,
    async close() {
      await pool.end();
      execFileSync(
        join(bin, "pg_ctl"),
        ["-D", join(dir, "data"), "-m", "fast", "stop"],
        { stdio: "ignore" },
      );
      rmSync(dir, { recursive: true });
    },
  };
}
/** HTTP adapter for exercising the real Supabase SDK against the real test SQL.
 * Auth users are fixtures; Supabase JWT verification itself is outside this test.
 */
export function restFixture(
  pool: Pool,
  store: TransportStore,
  users: Record<string, string>,
) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://fixture");
      if (url.pathname === "/auth/v1/user") {
        const uid = users[String(req.headers.authorization ?? "")];
        json(
          res,
          uid
            ? {
                id: uid,
                email: "fixture@example.invalid",
                aud: "authenticated",
                role: "authenticated",
              }
            : { error: "invalid_token" },
          uid ? 200 : 401,
        );
        return;
      }
      if (req.headers.apikey !== "fixture-secret-key-at-least-20-characters") {
        json(res, { message: "forbidden" }, 403);
        return;
      }
      if (url.pathname.startsWith("/auth/v1/admin/users/")) {
        const uid = url.pathname.split("/").at(-1)!;
        const exists = Object.values(users).includes(uid);
        json(res, exists ? { user: { id: uid, email: "fixture@example.invalid" } }
          : { message: "User not found", code: "user_not_found" }, exists ? 200 : 404);
        return;
      }
      if (url.pathname.startsWith("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1)!;
        const args = JSON.parse(await body(req));
        json(res, await store.rpc(name, args));
        return;
      }
      const table = ident(url.pathname.split("/").at(-1)!);
      const values: unknown[] = [];
      const filters: string[] = [];
      for (const [key, value] of url.searchParams) {
        if (["select", "order", "limit"].includes(key)) continue;
        const [op, ...rest] = value.split(".");
        const raw = rest.join(".");
        const operator = (
          { eq: "=", gt: ">", lt: "<" } as Record<string, string>
        )[op!];
        if (!operator) throw new Error("unsupported_filter");
        values.push(raw);
        filters.push(`${ident(key)}${operator}$${values.length}`);
      }
      const where = filters.length ? ` WHERE ${filters.join(" AND ")}` : "";
      const selected = url.searchParams.get("select") ?? "*";
      const columns =
        selected === "*" ? "*" : selected.split(",").map(ident).join(",");
      let sql: string;
      if (req.method === "POST") {
        const input = JSON.parse(await body(req)),
          keys = Object.keys(input);
        values.length = 0;
        values.push(...Object.values(input));
        sql = `INSERT INTO public.${table}(${keys.map(ident)}) VALUES(${keys.map((_, i) => `$${i + 1}`)}) RETURNING ${columns}`;
      } else if (req.method === "PATCH") {
        const input = JSON.parse(await body(req)),
          keys = Object.keys(input);
        const assignments = keys.map((k) => {
          values.push(input[k]);
          return `${ident(k)}=$${values.length}`;
        });
        sql = `UPDATE public.${table} SET ${assignments.join(",")}${where} RETURNING ${columns}`;
      } else {
        const order = url.searchParams.get("order");
        const limit = Number(url.searchParams.get("limit") ?? 1000);
        sql = `SELECT ${columns} FROM public.${table}${where}${order ? ` ORDER BY ${ident(order.split(".")[0]!)} ${order.endsWith(".desc") ? "DESC" : "ASC"}` : ""} LIMIT ${Math.min(limit, 1000)}`;
      }
      const result = await pool.query(sql, values);
      const single = String(req.headers.accept).includes("vnd.pgrst.object");
      if (single && result.rows.length !== 1) {
        json(
          res,
          {
            code: "PGRST116",
            details: `The result contains ${result.rows.length} rows`,
            message: "Cannot coerce to single",
          },
          406,
        );
        return;
      }
      json(
        res,
        single ? result.rows[0] : result.rows,
        req.method === "POST" ? 201 : 200,
      );
    } catch (e) {
      const error = e as { code?: string; message: string };
      json(res, { code: error.code ?? "P0001", message: error.message }, 400);
    }
  });
}
