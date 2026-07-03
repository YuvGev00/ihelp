import { z } from "zod";

/** The helper dictates the terms: a price (paid requests only — DB-enforced),
 *  or no price at all = volunteering. Empty input means volunteering. */
export const offerSchema = z.object({
  message: z
    .string()
    .trim()
    .min(5, "כמה מילים על איך תעזרו — 5 תווים לפחות")
    .max(1000, "עד 1000 תווים"),
  price: z.coerce
    .number()
    .positive("מחיר חיובי")
    .max(99999.99, "עד 99,999.99 ₪")
    .optional(),
});
