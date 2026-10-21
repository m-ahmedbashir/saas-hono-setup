/**
 * An organization's seat situation — the contract Better Auth's organization plugin
 * consults before anyone is invited (`invitationLimit`) or joins (`membershipLimit`). The
 * answer depends on the org's plan and subscription, which live in apps/api, and
 * packages/core must never import apps/api — so core owns the contract and apps/api
 * registers the implementation at startup, the same interface-in-core /
 * implementation-in-apps split as NotificationDispatcher and BillingGateway.
 */
export interface SeatUsage {
  /** Most members the org may have; `Infinity` for a plan with no member cap. */
  limit: number;
  /** Members it has right now. */
  members: number;
}

export type SeatUsageResolver = (organizationId: string) => Promise<SeatUsage>;

let resolver: SeatUsageResolver | null = null;

export function registerSeatUsageResolver(next: SeatUsageResolver): void {
  resolver = next;
}

export async function resolveSeatUsage(organizationId: string): Promise<SeatUsage> {
  // Fail closed, never fall back to Better Auth's default of 100: an unregistered resolver
  // is a wiring bug, and silently allowing joins would let orgs exceed what they pay for.
  if (!resolver) {
    throw new Error(
      "No seat usage resolver registered — apps/api registers one at startup (lib/auth-wiring.ts)",
    );
  }
  return resolver(organizationId);
}
