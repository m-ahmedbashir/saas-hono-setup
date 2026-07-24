// Creates (or updates) the restricted `app_user` Postgres role the app connects as for
// its own runtime queries — deliberately NOT the owner role in DATABASE_URL, which has
// BYPASSRLS by default on Neon (and is effectively a superuser on most other Postgres
// hosts too). Without this, Row-Level Security policies do nothing. See AGENTS.md.
//
// Usage: DATABASE_URL=<owner connection> APP_ROLE_PASSWORD=<a real secret> node scripts/create-app-role.js
// Re-running is safe — updates the password/grants if the role already exists.
import { Client } from "pg";

const ownerUrl = process.env.DATABASE_URL;
const password = process.env.APP_ROLE_PASSWORD;

if (!ownerUrl) throw new Error("DATABASE_URL (the owner/migration role) must be set");
if (!password) throw new Error("APP_ROLE_PASSWORD must be set — generate one yourself, don't hardcode a default");

const client = new Client({ connectionString: ownerUrl });
await client.connect();

// CREATE/ALTER ROLE don't support bind parameters ($1) for the PASSWORD clause (DDL,
// not DML) — dollar-quoting is the safe way to inline an arbitrary literal instead of
// string-concatenating it directly into the statement. Guard against the one way this
// could still go wrong: if the password itself ever contained the tag, the quote would
// terminate early and the remainder would be parsed as SQL — reject that outright
// rather than silently mis-executing DDL against the owner connection.
if (password.includes("$pw$")) {
  throw new Error('APP_ROLE_PASSWORD must not contain the literal substring "$pw$"');
}
const quotedPassword = `$pw$${password}$pw$`;
const exists = await client.query("select 1 from pg_roles where rolname = 'app_user'");

if (exists.rows.length > 0) {
  await client.query(`ALTER ROLE app_user WITH LOGIN PASSWORD ${quotedPassword} NOBYPASSRLS`);
  console.log("app_user already existed — password/attributes updated.");
} else {
  await client.query(`CREATE ROLE app_user WITH LOGIN PASSWORD ${quotedPassword} NOBYPASSRLS`);
  console.log("app_user created.");
}

await client.query("GRANT USAGE ON SCHEMA public TO app_user");
await client.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user");
await client.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user");
// So tables added by future migrations are automatically covered — no manual grant
// needed every time a new table lands.
await client.query(
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user",
);
await client.query("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user");

const check = await client.query("select rolbypassrls from pg_roles where rolname = 'app_user'");
if (check.rows[0].rolbypassrls) {
  throw new Error("app_user has BYPASSRLS set — something overrode NOBYPASSRLS, refusing to continue silently");
}

console.log("Grants applied. app_user confirmed to NOT have BYPASSRLS.");
await client.end();
