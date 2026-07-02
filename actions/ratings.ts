"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ratingSchema } from "@/lib/validation/rating";
import { type ActionResult, mapDbError } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

export async function submitRating(
  requestId: string,
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = ratingSchema.safeParse({
    stars: formData.get("stars"),
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // RPC: inserts the rating and advances completed -> rated atomically.
  const { error } = await supabase.rpc("submit_rating", {
    p_request_id: requestId,
    p_stars: parsed.data.stars,
    p_note: parsed.data.note || null,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/my/requests");
  return { ok: true };
}
