"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema, signUpSchema } from "@/lib/validation/auth";
import { type ActionResult, GENERIC_ERROR } from "@/lib/errors";
import { S } from "@/lib/strings";
import { zodFieldErrors } from "./helpers";

export async function signUp(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) {
    // With email confirmation off, a duplicate email is a real 422 — telling
    // the user to retry would be a dead end; point them at login instead.
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { ok: false, formError: S.auth.emailTaken };
    }
    return { ok: false, formError: GENERIC_ERROR };
  }
  redirect("/profile"); // onboarding: set display name (+ location)
}

export async function signIn(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, formError: S.auth.badCredentials };
  }
  redirect("/requests");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
