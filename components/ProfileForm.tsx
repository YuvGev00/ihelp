"use client";

import { useActionState, useRef, useState } from "react";
import { updateProfile } from "@/actions/profile";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/ui";
import { PHOTO_MIME_TYPES } from "@/lib/validation/request";
import { S } from "@/lib/strings";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // matches the bucket limit

export function ProfileForm({
  displayName,
  phone,
  avatarPath,
}: {
  displayName: string;
  phone: string | null;
  avatarPath: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, null);
  // avatar state: undefined = unchanged; "" = cleared; string = new path
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Effective avatar path for preview: the new one, or the existing one.
  const previewPath = avatar === undefined ? avatarPath : avatar || null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);
    if (!PHOTO_MIME_TYPES.includes(file.type)) {
      setAvatarError("קובץ חייב להיות תמונה (JPG / PNG / WebP)");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("קובץ גדול מדי — עד 2MB");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAvatarError("שגיאה, נסו שוב");
      setBusy(false);
      return;
    }
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file);
    if (error) {
      setAvatarError("העלאה נכשלה, נסו שוב");
      setBusy(false);
      return;
    }
    setAvatar(path);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form action={formAction} className="card space-y-4">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar name={name} path={previewPath} size={64} />
        <div>
          <span className="field-label">{S.profile.avatar}</span>
          <p className="mb-1 text-xs text-stone-500">{S.profile.avatarHint}</p>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={PHOTO_MIME_TYPES.join(",")}
              onChange={onPick}
              disabled={busy}
              aria-label={S.profile.avatarChange}
              className="text-sm text-stone-600 file:me-2 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-emerald-700"
            />
            {previewPath && (
              <button
                type="button"
                onClick={() => setAvatar("")}
                className="text-sm text-red-600 underline"
              >
                {S.profile.avatarRemove}
              </button>
            )}
          </div>
          {busy && <p className="text-sm text-stone-500">מעלה…</p>}
          {avatarError && <p className="field-error">{avatarError}</p>}
        </div>
      </div>
      {/* only send avatarPath when it changed */}
      {avatar !== undefined && (
        <input type="hidden" name="avatarPath" value={avatar} />
      )}

      <div>
        <label htmlFor="displayName" className="field-label">
          {S.profile.displayName}
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          className="field-input"
        />
        {state && !state.ok && state.fieldErrors?.displayName && (
          <p className="field-error">{state.fieldErrors.displayName}</p>
        )}
      </div>

      <div>
        <label htmlFor="phone" className="field-label">
          {S.profile.phone}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          defaultValue={phone ?? ""}
          placeholder="0501234567"
          className="field-input"
        />
        <p className="mt-1 text-xs text-stone-500">{S.profile.phoneNote}</p>
        {state && !state.ok && state.fieldErrors?.phone && (
          <p className="field-error">{state.fieldErrors.phone}</p>
        )}
      </div>

      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      {state?.ok && <p className="text-sm text-emerald-700">{S.profile.saved}</p>}

      <button type="submit" disabled={pending || busy} className="btn-primary">
        {pending ? S.common.loading : S.profile.save}
      </button>
    </form>
  );
}
