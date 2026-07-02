"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from "@/lib/validation/request";
import { GENERIC_ERROR } from "@/lib/errors";

/**
 * Direct-to-storage uploader (architecture §5): files go browser -> Supabase
 * Storage with the user's JWT; only resulting paths enter the form. Server
 * Actions never carry file bytes (body-size limits).
 */
export function FileUploader({
  bucket,
  name,
  maxFiles = 1,
  label,
  hint,
}: {
  bucket: "request-photos" | "verification-docs";
  name: string; // hidden input name carrying uploaded path(s)
  maxFiles?: number;
  label: string;
  hint?: string;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setError(null);

    if (paths.length + files.length > maxFiles) {
      setError(`עד ${maxFiles} קבצים`);
      return;
    }
    for (const f of files) {
      if (!PHOTO_MIME_TYPES.includes(f.type)) {
        setError("קובץ חייב להיות תמונה (JPG / PNG / WebP)");
        return;
      }
      if (f.size > PHOTO_MAX_BYTES) {
        setError("קובץ גדול מדי — עד 5MB");
        return;
      }
    }

    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError(GENERIC_ERROR);
      setBusy(false);
      return;
    }

    const uploaded: string[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop() || "jpg";
      // Own-folder convention enforced by the storage policy: {user_id}/...
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, f);
      if (upErr) {
        setError(GENERIC_ERROR);
        setBusy(false);
        return;
      }
      uploaded.push(path);
    }
    setPaths((prev) => [...prev, ...uploaded]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <span className="field-label">{label}</span>
      {hint && <p className="mb-2 text-xs text-stone-500">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_MIME_TYPES.join(",")}
        multiple={maxFiles > 1}
        onChange={onChange}
        disabled={busy || paths.length >= maxFiles}
        className="block w-full text-sm text-stone-600 file:me-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-emerald-700"
      />
      {busy && <p className="mt-1 text-sm text-stone-500">מעלה…</p>}
      {error && <p className="field-error">{error}</p>}
      {paths.length > 0 && (
        <p className="mt-1 text-sm text-emerald-700">
          הועלו {paths.length} {paths.length === 1 ? "קובץ" : "קבצים"} ✓
        </p>
      )}
      {paths.map((p) => (
        <input key={p} type="hidden" name={name} value={p} />
      ))}
    </div>
  );
}
