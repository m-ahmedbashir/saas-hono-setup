import { describe, it, expect } from "vitest";
import { isLiveSubscription } from "./subscription-status";

describe("isLiveSubscription", () => {
  it("treats every status Stripe still bills (or is retrying) as live", () => {
    expect(isLiveSubscription("active")).toBe(true);
    expect(isLiveSubscription("past_due")).toBe(true);
    expect(isLiveSubscription("incomplete")).toBe(true);
  });

  it("treats a canceled subscription, or never having had one, as not live", () => {
    expect(isLiveSubscription("canceled")).toBe(false);
    expect(isLiveSubscription(null)).toBe(false);
  });
});
