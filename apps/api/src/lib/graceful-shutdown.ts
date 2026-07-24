import type { ServerType } from "@hono/node-server";
import { closePool } from "@repo/db";

const SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Stops accepting new connections, lets in-flight requests finish, closes the DB pool,
 * then exits — instead of a deploy/scale-down/Ctrl+C signal killing the process
 * mid-request with no chance to finish or release connections back to Postgres.
 *
 * Force-exits after SHUTDOWN_TIMEOUT_MS regardless of whether the server finished
 * closing: `server.close()`'s callback only fires once every connection it's tracking
 * has ended, but it doesn't proactively close already-upgraded WebSocket connections —
 * a client that just stays connected would otherwise make this hang forever.
 */
export function registerGracefulShutdown(server: ServerType): void {
  let shuttingDown = false;

  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully...`);

    const forceExitTimer = setTimeout(() => {
      console.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close(async (err) => {
      if (err) console.error("Error closing HTTP server", err);
      try {
        await closePool();
      } catch (poolErr) {
        console.error("Error closing DB pool", poolErr);
      }
      clearTimeout(forceExitTimer);
      process.exit(err ? 1 : 0);
    });
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
