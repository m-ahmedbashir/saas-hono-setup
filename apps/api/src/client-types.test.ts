import { describe, expectTypeOf, it } from "vitest";
import { hc, type InferRequestType, type InferResponseType } from "hono/client";
import type { z } from "zod";
import type { AppType } from "./client-types";
import type {
  IndividualBillingView,
  IndividualPlanOption,
  OrganizationBillingView,
  OrganizationPlanOption,
} from "./modules/billing/billing.service";
import type {
  checkoutRequestSchema,
  individualCheckoutRequestSchema,
} from "./modules/billing/billing.schema";

// Type-level proof (specs/typed-api-client-plan.md Task 1) that request and response types
// flow from the validators in billing.routes.ts and the handlers in the *separate*
// billing.controller.ts all the way to the frontends' hc<AppType> client. These assertions
// are checked by `tsc` (pnpm typecheck), not at runtime — a runtime test can't show this.
type Client = ReturnType<typeof hc<AppType>>;

describe("AppType (hc client) — billing routes", () => {
  it("infers success response bodies from the controller's success(c, data) calls", () => {
    expectTypeOf<
      InferResponseType<Client["billing"]["organization"]["$get"], 200>
    >().toEqualTypeOf<{
      success: true;
      data: OrganizationBillingView;
    }>();
    expectTypeOf<InferResponseType<Client["billing"]["individual"]["$get"], 200>>().toEqualTypeOf<{
      success: true;
      data: IndividualBillingView;
    }>();
    expectTypeOf<
      InferResponseType<Client["billing"]["organization-plans"]["$get"], 200>
    >().toEqualTypeOf<{ success: true; data: { plans: OrganizationPlanOption[] } }>();
    expectTypeOf<
      InferResponseType<Client["billing"]["individual-plans"]["$get"], 200>
    >().toEqualTypeOf<{ success: true; data: { plans: IndividualPlanOption[] } }>();
    expectTypeOf<
      InferResponseType<Client["billing"]["organization-checkout"]["$post"], 200>
    >().toEqualTypeOf<{ success: true; data: { checkoutUrl: string } }>();
    expectTypeOf<
      InferResponseType<Client["billing"]["organization-cancel"]["$post"], 200>
      // `boolean`, not `true`: success<T> infers T without `const`, widening the literal —
      // same as it would inline in .routes.ts, so not a controller-boundary loss.
    >().toEqualTypeOf<{ success: true; data: { canceled: boolean } }>();
  });

  it("infers request bodies from the inline zValidator, not the controller", () => {
    expectTypeOf<
      InferRequestType<Client["billing"]["organization-checkout"]["$post"]>["json"]
    >().toEqualTypeOf<z.input<typeof checkoutRequestSchema>>();
    expectTypeOf<
      InferRequestType<Client["billing"]["individual-checkout"]["$post"]>["json"]
    >().toEqualTypeOf<z.input<typeof individualCheckoutRequestSchema>>();
  });

  it("rejects a shape that doesn't match the server's", () => {
    expectTypeOf<
      InferResponseType<Client["billing"]["organization"]["$get"], 200>["data"]
      // @ts-expect-error — `plan` is a string on the server; if this ever compiles, inference collapsed to any
    >().toEqualTypeOf<{ plan: number; subscriptionStatus: null; seatQuantity: null }>();
  });
});
