import { createApiClient } from "@repo/shared/hc-client";
// Type-only: client-types.ts has no runtime code, so no server code can reach the bundle.
import type { AppType } from "@repo/api/client-types";

// Every call to apps/api goes through this client (see @repo/shared/hc-client).
export const api = createApiClient<AppType>(process.env.NEXT_PUBLIC_API_URL);
