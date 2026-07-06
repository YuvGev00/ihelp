import { z } from "zod";

/**
 * The helper picks one of three stances (spec §8.4):
 *   fixed     — a price now
 *   volunteer — free
 *   after_job — price decided once the work is done (many jobs can't be quoted
 *               sight-unseen). The final amount is set later via set_final_price.
 */
export const offerSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(5, "כמה מילים על איך תעזרו — 5 תווים לפחות")
      .max(1000, "עד 1000 תווים"),
    pricingMode: z.enum(["fixed", "volunteer", "after_job"]),
    price: z.coerce
      .number()
      .positive("מחיר חיובי")
      .max(99999.99, "עד 99,999.99 ₪")
      .optional(),
  })
  .refine((v) => (v.pricingMode === "fixed") === (v.price !== undefined), {
    message: "מחיר קבוע מחייב סכום; שאר האפשרויות — בלי סכום",
    path: ["price"],
  });

/** The after-job final amount, entered once the request is completed. */
export const finalPriceSchema = z.object({
  price: z.coerce
    .number()
    .positive("מחיר חיובי")
    .max(99999.99, "עד 99,999.99 ₪"),
});
