"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestSchema, requestEditSchema } from "@/lib/validation/request";
import { type ActionResult, DENIED_ERROR, mapDbError } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

export async function createRequest(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = requestSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
    photoPaths: formData.getAll("photoPaths").filter(Boolean),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // Atomic insert of request + photos; the RPC re-verifies photo ownership,
  // existence, and the >=1 photo rule (the DB is the authority).
  const { data, error } = await supabase.rpc("create_request_with_photos", {
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_category: parsed.data.category,
    p_lat: parsed.data.lat,
    p_lng: parsed.data.lng,
    p_photo_paths: parsed.data.photoPaths,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath("/requests");
  revalidatePath("/my/requests");
  redirect(`/requests/${data}`);
}

export async function updateRequest(
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = requestEditSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // Silent-denial pattern: RLS USING filters non-owner / non-editable rows to
  // zero affected rows — .select() + empty result = denial.
  const { data, error } = await supabase
    .from("help_requests")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
    })
    .eq("id", requestId)
    .select();
  if (error) return { ok: false, formError: mapDbError(error) };
  if (!data?.length) return { ok: false, formError: DENIED_ERROR };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/my/requests");
  return { ok: true };
}

export async function cancelRequest(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_request", {
    p_request_id: requestId,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/my/requests");
  return { ok: true };
}

export async function assignOffer(
  requestId: string,
  offerId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_offer", {
    p_request_id: requestId,
    p_offer_id: offerId,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
  revalidatePath("/my/requests");
  revalidatePath("/my/offers");
  return { ok: true };
}

export async function confirmCompletion(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_completion", {
    p_request_id: requestId,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/requests");
  revalidatePath("/my/offers");
  return { ok: true };
}

export async function markPaid(requestId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_paid", { p_request_id: requestId });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/requests");
  return { ok: true };
}
