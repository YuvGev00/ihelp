"use client";

import { useActionState, useTransition, useState } from "react";
import {
  reviewApplication,
  setRequestHidden,
  revokeVerification,
} from "@/actions/admin";
import { S } from "@/lib/strings";

export function ReviewForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(reviewApplication, null);
  const [decision, setDecision] = useState<"true" | "false">("true");

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-stone-100 pt-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input type="hidden" name="approve" value={decision} />
      <div>
        <label className="field-label">{S.admin.noteLabel}</label>
        <input name="note" className="field-input" maxLength={500} />
        {state && !state.ok && state.fieldErrors?.note && (
          <p className="field-error">{state.fieldErrors.note}</p>
        )}
      </div>
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          onClick={() => setDecision("true")}
          className="btn-primary"
        >
          {S.admin.approve}
        </button>
        <button
          type="submit"
          disabled={pending}
          onClick={() => setDecision("false")}
          className="btn-danger"
        >
          {S.admin.reject}
        </button>
      </div>
    </form>
  );
}

export function HideToggle({
  requestId,
  hidden,
}: {
  requestId: string;
  hidden: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setRequestHidden(requestId, !hidden);
        })
      }
      className={hidden ? "btn-secondary" : "btn-danger"}
    >
      {hidden ? S.admin.unhide : S.admin.hide}
    </button>
  );
}

export function RevokeButton({
  userId,
  kind,
}: {
  userId: string;
  kind: "identity" | "professional";
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!window.confirm(S.admin.revokeConfirm)) return;
        startTransition(async () => {
          await revokeVerification(userId, kind);
        });
      }}
      className="btn-danger"
    >
      {S.admin.revoke} ({S.admin.kind[kind]})
    </button>
  );
}
