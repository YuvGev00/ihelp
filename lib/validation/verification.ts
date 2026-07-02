import { z } from "zod";
import { phoneRegex } from "./profile";

export const identityApplicationSchema = z.object({
  fullName: z.string().trim().min(2, "שם מלא — 2 תווים לפחות").max(60, "עד 60 תווים"),
  selfDescription: z.string().trim().max(500, "עד 500 תווים"),
  // phone is required on the identity application (mirrors identity_requires_phone)
  phone: z.string().trim().regex(phoneRegex, "מספר טלפון לא תקין (למשל 0501234567)"),
  docPath: z.string().optional().or(z.literal("")),
});

export const professionalApplicationSchema = z.object({
  fullName: z.string().trim().min(2, "שם מלא — 2 תווים לפחות").max(60, "עד 60 תווים"),
  selfDescription: z.string().trim().max(500, "עד 500 תווים"),
  // the certificate is the point (mirrors professional_requires_doc)
  docPath: z.string().min(1, "יש לצרף תעודה"),
});

export const reviewSchema = z
  .object({
    applicationId: z.string().uuid(),
    approve: z.boolean(),
    note: z.string().trim().max(500, "עד 500 תווים").optional().or(z.literal("")),
  })
  .refine((v) => v.approve || (v.note && v.note.length > 0), {
    message: "דחייה מחייבת נימוק",
    path: ["note"],
  });
