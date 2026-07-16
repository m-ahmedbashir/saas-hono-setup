import { existsSync } from "node:fs";

const envPath = new URL("../../.env.development", import.meta.url);

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
