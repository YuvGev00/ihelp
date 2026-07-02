import { z } from "zod";

export const offerSchema = z.object({
  message: z
    .string()
    .trim()
    .min(5, "כמה מילים על איך תעזרו — 5 תווים לפחות")
    .max(1000, "עד 1000 תווים"),
  proposedTerms: z.string().trim().max(300, "עד 300 תווים").optional().or(z.literal("")),
});
