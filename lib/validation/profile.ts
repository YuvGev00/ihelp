import { z } from "zod";

/** Israeli phone: 0 followed by 8-9 digits — mirrors the DB CHECK. */
export const phoneRegex = /^0\d{8,9}$/;

export const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "יש להזין שם תצוגה")
    .max(40, "עד 40 תווים"),
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, "מספר טלפון לא תקין (למשל 0501234567)")
    .optional()
    .or(z.literal("")),
  // storage path of an uploaded avatar; "" clears it, undefined leaves unchanged
  avatarPath: z.string().optional(),
});

export const locationSchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
