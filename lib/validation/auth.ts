import { z } from "zod";

export const signUpSchema = z.object({
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "סיסמה באורך 8 תווים לפחות"),
});

export const signInSchema = z.object({
  email: z.string().email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "יש להזין סיסמה"),
});
