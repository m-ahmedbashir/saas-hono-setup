import { z } from "zod";

// UX-only — mirrors billing.service.ts's assertSeatQuantity (at least one seat per current
// member, at most the plan's member limit), which is the real authority on checkout.
export function seatQuantitySchema({
  memberCount,
  seatLimit,
}: {
  memberCount: number;
  seatLimit: number | null;
}) {
  const min = Math.max(memberCount, 1);
  const max = seatLimit ?? 1000;
  return z.object({
    seats: z
      .number({ error: "Enter a number of seats" })
      .int("Seats must be a whole number")
      .min(min, `Choose at least ${min} seats — your organization has ${memberCount} members`)
      .max(max, `This plan allows at most ${max} seats`),
  });
}

export type SeatQuantityValues = z.infer<ReturnType<typeof seatQuantitySchema>>;
