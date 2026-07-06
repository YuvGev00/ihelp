"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { offerSchema, finalPriceSchema } from "@/lib/validation/offer";
import { type ActionResult, DENIED_ERROR, mapDbError } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

function parseOffer(formData: FormData) {
  const rawPrice = formData.get("price");
  return offerSchema.safeParse({
    message: formData.get("message"),
    pricingMode: formData.get("pricingMode"),
    // price only carried by the 'fixed' stance; empty/absent otherwise
    price: rawPrice === null || rawPrice === "" ? undefined : rawPrice,
  });
}

export async function createOffer(
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = parseOffer(formData);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, formError: DENIED_ERROR };

  // The INSERT policy + price_matches_mode CHECK are the real gate: verified
  // caller, not own request, request open/visible, status pinned to 'active',
  // one active offer per helper, and charging (fixed/after_job) only on paid
  // requests. Volunteering allowed anywhere.
  const { error } = await supabase.from("offers").insert({
    request_id: requestId,
    helper_id: user.id,
    message: parsed.data.message,
    pricing_mode: parsed.data.pricingMode,
    price: parsed.data.pricingMode === "fixed" ? parsed.data.price : null,
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
  const parsed = parseOffer(formData);
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // pricing_mode is immutable (column guard); a helper editing an active offer
  // may change the message and, for a fixed offer, the price.
  const { data, error } = await supabase
    .from("offers")
    .update({
      message: parsed.data.message,
      price: parsed.data.pricingMode === "fixed" ? parsed.data.price : null,
    })
    .eq("id", offerId)
    .select();
  if (error) return { ok: false, formError: mapDbError(error) };
  if (!data?.length) return { ok: false, formError: DENIED_ERROR };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/offers");
  return { ok: true };
}

/** The selected helper of an after_job offer sets the final amount once the
 *  request is completed (spec §8.4). */
export async function setFinalPrice(
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const rawPrice = formData.get("price");
  const parsed = finalPriceSchema.safeParse({
    price: rawPrice === null || rawPrice === "" ? undefined : rawPrice,
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_final_price", {
    p_request_id: requestId,
    p_price: parsed.data.price,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
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
