import { z } from "zod";

export const ratingSchema = z.object({
  stars: z.coerce.number().int().min(1, "יש לבחור 1–5 כוכבים").max(5, "יש לבחור 1–5 כוכבים"),
  note: z.string().trim().max(500, "עד 500 תווים").optional().or(z.literal("")),
});
