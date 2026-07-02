/**
 * RPC/DB error-code → Hebrew UI message mapping (design doc 03 §5).
 * RPCs raise stable codes; RLS denials and unknown failures collapse into
 * generic messages that leak nothing about row existence.
 */

const RPC_ERRORS: Record<string, string> = {
  not_found: "הבקשה לא נמצאה",
  forbidden: "אין לך הרשאה לפעולה זו",
  invalid_state: "הפעולה אינה זמינה במצב הנוכחי",
  offer_not_active: "ההצעה כבר אינה זמינה — רעננו את העמוד",
  photos_required: "יש לצרף 1–5 תמונות",
  too_many_photos: "יש לצרף 1–5 תמונות",
  photo_not_uploaded: "העלאת התמונות נכשלה — נסו שוב",
  location_required: "יש לאשר מיקום לבקשה",
  note_required: "דחייה מחייבת נימוק",
};

export const GENERIC_ERROR = "משהו השתבש, נסו שוב";
export const DENIED_ERROR = "אין לך הרשאה לפעולה זו";

/** Maps a Supabase/Postgres error to a user-facing Hebrew message. */
export function mapDbError(error: { message?: string } | null): string {
  if (!error?.message) return GENERIC_ERROR;
  const known = Object.keys(RPC_ERRORS).find((code) =>
    error.message!.includes(code)
  );
  if (known) return RPC_ERRORS[known];
  // RLS WITH CHECK violations / permission errors → generic denial
  if (
    error.message.includes("row-level security") ||
    error.message.includes("permission denied")
  ) {
    return DENIED_ERROR;
  }
  return GENERIC_ERROR;
}

/** Uniform Server Action result (design doc 03 §5). */
export type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; formError?: string; fieldErrors?: Record<string, string> };
