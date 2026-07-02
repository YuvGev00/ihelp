"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, locationSchema } from "@/lib/validation/profile";
import { type ActionResult, DENIED_ERROR, GENERIC_ERROR } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, formError: DENIED_ERROR };

  // Silent-denial pattern: USING-filtered updates return zero rows, not errors.
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id)
    .select();
  if (error || !data?.length) return { ok: false, formError: DENIED_ERROR };

  if (parsed.data.phone) {
    const { data: priv, error: privError } = await supabase
      .from("profiles_private")
      .update({ phone: parsed.data.phone })
      .eq("user_id", user.id)
      .select();
    if (privError || !priv?.length) return { ok: false, formError: GENERIC_ERROR };
  }

  revalidatePath("/profile");
  return { ok: true };
}

/** Persists the browser-captured location; the server row is the source of truth. */
export async function updateLocation(
  lat: number,
  lng: number
): Promise<ActionResult> {
  const parsed = locationSchema.safeParse({ lat, lng });
  if (!parsed.success) return { ok: false, formError: GENERIC_ERROR };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, formError: DENIED_ERROR };

  const { data, error } = await supabase
    .from("profiles_private")
    .update({ lat: parsed.data.lat, lng: parsed.data.lng })
    .eq("user_id", user.id)
    .select();
  if (error || !data?.length) return { ok: false, formError: GENERIC_ERROR };

  revalidatePath("/profile");
  revalidatePath("/requests");
  return { ok: true };
}
