"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { reviewSchema } from "@/lib/validation/verification";
import { type ActionResult, mapDbError } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

export async function reviewApplication(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse({
    applicationId: formData.get("applicationId"),
    approve: formData.get("approve") === "true",
    note: formData.get("note"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  // Admin authority is checked inside the RPC (is_admin()), not here.
  const { error } = await supabase.rpc("review_application", {
    p_application_id: parsed.data.applicationId,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note || null,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath("/admin");
  revalidatePath("/verification");
  return { ok: true };
}

export async function setRequestHidden(
  requestId: string,
  hidden: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_request_hidden", {
    p_request_id: requestId,
    p_hidden: hidden,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath("/admin");
  revalidatePath("/requests");
  revalidatePath(`/requests/${requestId}`);
  return { ok: true };
}

export async function revokeVerification(
  userId: string,
  kind: "identity" | "professional"
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_verification", {
    p_user_id: userId,
    p_kind: kind,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath("/admin");
  return { ok: true };
}
