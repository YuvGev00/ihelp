import { z } from "zod";
import { CATEGORY_KEYS } from "@/lib/categories";

/** Mirrors the DB constraints on help_requests (design doc 03 §1.2, §9). */
export const requestSchema = z
  .object({
    title: z.string().trim().min(3, "כותרת — 3 תווים לפחות").max(80, "עד 80 תווים"),
    description: z
      .string()
      .trim()
      .min(10, "תיאור — 10 תווים לפחות")
      .max(2000, "עד 2000 תווים"),
    category: z.enum(CATEGORY_KEYS, { message: "יש לבחור קטגוריה" }),
    paymentType: z.enum(["paid", "volunteer"]),
    amount: z.coerce.number().positive("סכום חיובי").max(99999.99, "עד 99,999.99 ₪").optional(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    photoPaths: z.array(z.string().min(1)).min(1, "יש לצרף לפחות תמונה אחת").max(5, "עד 5 תמונות"),
  })
  .refine((v) => (v.paymentType === "paid") === (v.amount !== undefined), {
    message: "בקשה בתשלום מחייבת סכום; התנדבות — בלי סכום",
    path: ["amount"],
  });

/** Content-only edit: transitions and photos are not editable (design 03 §2, §4). */
export const requestEditSchema = z
  .object({
    title: z.string().trim().min(3, "כותרת — 3 תווים לפחות").max(80, "עד 80 תווים"),
    description: z
      .string()
      .trim()
      .min(10, "תיאור — 10 תווים לפחות")
      .max(2000, "עד 2000 תווים"),
    category: z.enum(CATEGORY_KEYS, { message: "יש לבחור קטגוריה" }),
    paymentType: z.enum(["paid", "volunteer"]),
    amount: z.coerce.number().positive("סכום חיובי").max(99999.99, "עד 99,999.99 ₪").optional(),
  })
  .refine((v) => (v.paymentType === "paid") === (v.amount !== undefined), {
    message: "בקשה בתשלום מחייבת סכום; התנדבות — בלי סכום",
    path: ["amount"],
  });

/** Client-side upload bounds (re-bounded server-side by bucket config). */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
