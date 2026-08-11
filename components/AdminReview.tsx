"use client";

import { useActionState } from "react";
import {
  reviewApplication,
  setRequestHidden,
  revokeVerification,
} from "@/actions/admin";
import { useConfirmedTransition } from "@/components/LifecycleActions";
import { S } from "@/lib/strings";

export function ReviewForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, pending] = useActionState(reviewApplication, null);
  const noteId = `note-${applicationId}`;

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t border-line pt-3">
      <input type="hidden" name="applicationId" value={applicationId} />
      <div>
        <label htmlFor={noteId} className="field-label">
          {S.admin.noteLabel}
        </label>
        <input
          id={noteId}
          name="note"
          className="field-input"
          maxLength={500}
          // implicit submission (Enter) would click the first submit button —
          // an accidental Approve. Deciding requires an explicit click.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
        />
        {state && !state.ok && state.fieldErrors?.note && (
          <p className="field-error">{state.fieldErrors.note}</p>
        )}
      </div>
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      {/* The decision rides on the submitter's own name/value (React 19 puts
          it in the action's FormData). A hidden-input-plus-onClick pattern
          would let Enter-in-the-note-field approve by implicit submission. */}
      <div className="flex gap-2">
        <button
          type="submit"
          name="approve"
          value="true"
          disabled={pending}
          className="btn-primary"
        >
          {S.admin.approve}
        </button>
        <button
          type="submit"
          name="approve"
          value="false"
          disabled={pending}
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
  const { pending, error, run } = useConfirmedTransition(null, () =>
    setRequestHidden(requestId, !hidden)
  );
  return (
    <span>
      <button
        disabled={pending}
        onClick={run}
        className={hidden ? "btn-secondary" : "btn-danger"}
      >
        {pending ? S.common.loading : hidden ? S.admin.unhide : S.admin.hide}
      </button>
      {error && <span className="field-error block">{error}</span>}
    </span>
  );
}

export function RevokeButton({
  userId,
  kind,
}: {
  userId: string;
  kind: "identity" | "professional";
}) {
  const { pending, error, run } = useConfirmedTransition(
    S.admin.revokeConfirm,
    () => revokeVerification(userId, kind)
  );
  return (
    <span>
      <button disabled={pending} onClick={run} className="btn-danger">
        {pending
          ? S.common.loading
          : `${S.admin.revoke} (${S.admin.kind[kind]})`}
      </button>
      {error && <span className="field-error block">{error}</span>}
    </span>
  );
}
