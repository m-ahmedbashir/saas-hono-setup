import { existsSync } from "node:fs";

// .env.test first: process.loadEnvFile never overwrites a variable that's already set, so
// its database URLs (the local Docker database, docker-compose.yml) win, and
// .env.development fills in everything else. Without a .env.test — CI, or a machine
// without Docker — tests use .env.development's database, as before.
for (const file of ["../../.env.test", "../../.env.development"]) {
  const envPath = new URL(file, import.meta.url);
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}
