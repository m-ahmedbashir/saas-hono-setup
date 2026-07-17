import { z } from "zod";
import { plans } from "@repo/core";

const planIds = Object.keys(plans) as [keyof typeof plans, ...(keyof typeof plans)[]];

export const checkoutRequestSchema = z.object({
  planId: z.enum(planIds),
  quantity: z.number().int().positive().max(1000),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
