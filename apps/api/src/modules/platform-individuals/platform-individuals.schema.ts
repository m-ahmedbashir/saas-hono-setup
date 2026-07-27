import { z } from "zod";

export const listPlatformIndividualsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().min(1).optional(),
});

export type ListPlatformIndividualsQuery = z.infer<typeof listPlatformIndividualsQuerySchema>;
