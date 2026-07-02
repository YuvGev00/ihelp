"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  identityApplicationSchema,
  professionalApplicationSchema,
} from "@/lib/validation/verification";
import { type ActionResult, mapDbError } from "@/lib/errors";
import { zodFieldErrors } from "./helpers";

export async function submitIdentityApplication(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = identityApplicationSchema.safeParse({
    fullName: formData.get("fullName"),
    selfDescription: formData.get("selfDescription"),
    phone: formData.get("phone"),
    docPath: formData.get("docPath"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, formError: mapDbError(null) };

  // RLS pins user_id/status/decided_*; the partial unique index blocks a
  // second open application of the same kind.
  const { error } = await supabase.from("verification_applications").insert({
    user_id: user.id,
    kind: "identity",
    full_name: parsed.data.fullName,
    self_description: parsed.data.selfDescription,
    phone: parsed.data.phone,
    doc_path: parsed.data.docPath || null,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath("/verification");
  return { ok: true };
}

export async function submitProfessionalApplication(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const parsed = professionalApplicationSchema.safeParse({
    fullName: formData.get("fullName"),
    selfDescription: formData.get("selfDescription"),
    docPath: formData.get("docPath"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, formError: mapDbError(null) };

  const { error } = await supabase.from("verification_applications").insert({
    user_id: user.id,
    kind: "professional",
    full_name: parsed.data.fullName,
    self_description: parsed.data.selfDescription,
    doc_path: parsed.data.docPath,
  });
  if (error) return { ok: false, formError: mapDbError(error) };

  revalidatePath("/verification");
  return { ok: true };
}
