"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { offerSchema } from "@/lib/validation/offer";
import { type ActionResult, DENIED_ERROR, mapDbError } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

export async function createOffer(
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const rawPrice = formData.get("price");
  const parsed = offerSchema.safeParse({
    message: formData.get("message"),
    // absent/empty price = volunteering (input not rendered on volunteer
    // requests; empty on paid = the helper offers for free)
    price: rawPrice === null || rawPrice === "" ? undefined : rawPrice,
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, formError: DENIED_ERROR };

  // The INSERT policy is the real gate: verified caller, not own request,
  // request open/has_offers and visible, status pinned to 'active', one active
  // offer per helper (partial unique index), price only on paid requests.
  const { error } = await supabase.from("offers").insert({
    request_id: requestId,
    helper_id: user.id,
    message: parsed.data.message,
    price: parsed.data.price ?? null,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/offers");
  return { ok: true };
}

export async function updateOffer(
  offerId: string,
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const rawPrice = formData.get("price");
  const parsed = offerSchema.safeParse({
    message: formData.get("message"),
    price: rawPrice === null || rawPrice === "" ? undefined : rawPrice,
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // Silent-denial pattern (zero rows = not owner / not active anymore).
  const { data, error } = await supabase
    .from("offers")
    .update({
      message: parsed.data.message,
      price: parsed.data.price ?? null,
    })
    .eq("id", offerId)
    .select();
  if (error) return { ok: false, formError: mapDbError(error) };
  if (!data?.length) return { ok: false, formError: DENIED_ERROR };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/offers");
  return { ok: true };
}

export async function withdrawOffer(
  offerId: string,
  requestId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({ status: "withdrawn" })
    .eq("id", offerId)
    .select();
  if (error) return { ok: false, formError: mapDbError(error) };
  if (!data?.length) return { ok: false, formError: DENIED_ERROR };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/offers");
  return { ok: true };
}
