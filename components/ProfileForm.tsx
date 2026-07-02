"use client";

import { useActionState } from "react";
import { updateProfile } from "@/actions/profile";
import { S } from "@/lib/strings";

export function ProfileForm({
  displayName,
  phone,
}: {
  displayName: string;
  phone: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, null);

  return (
    <form action={formAction} className="card space-y-4">
      <div>
        <label htmlFor="displayName" className="field-label">
          {S.profile.displayName}
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName}
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

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? S.common.loading : S.profile.save}
      </button>
    </form>
  );
}
