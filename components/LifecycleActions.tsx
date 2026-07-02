"use client";

import { useActionState, useState, useTransition } from "react";
import {
  assignOffer,
  cancelRequest,
  confirmCompletion,
  markPaid,
} from "@/actions/requests";
import { submitRating } from "@/actions/ratings";
import { StarsInput } from "@/components/OfferForm";
import { S } from "@/lib/strings";

function useConfirmedTransition(confirmMessage: string | null, fn: () => Promise<{ ok: boolean; formError?: string }>) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await fn();
      setError(result.ok ? null : (result.formError ?? null));
    });
  };
  return { pending, error, run };
}

export function AssignButton({
  requestId,
  offerId,
}: {
  requestId: string;
  offerId: string;
}) {
  const { pending, error, run } = useConfirmedTransition(
    S.offers.chooseConfirm,
    () => assignOffer(requestId, offerId)
  );
  return (
    <span>
      <button disabled={pending} onClick={run} className="btn-primary">
        {pending ? S.common.loading : S.offers.choose}
      </button>
      {error && <span className="field-error block">{error}</span>}
    </span>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const { pending, error, run } = useConfirmedTransition(
    S.requests.cancelConfirm,
    () => cancelRequest(requestId)
  );
  return (
    <span>
      <button disabled={pending} onClick={run} className="btn-danger">
        {S.requests.cancelRequest}
      </button>
      {error && <span className="field-error block">{error}</span>}
    </span>
  );
}

export function ConfirmCompletionButton({ requestId }: { requestId: string }) {
  const { pending, error, run } = useConfirmedTransition(null, () =>
    confirmCompletion(requestId)
  );
  return (
    <span>
      <button disabled={pending} onClick={run} className="btn-primary">
        {pending ? S.common.loading : S.lifecycle.confirmCompletion}
      </button>
      {error && <span className="field-error block">{error}</span>}
    </span>
  );
}

export function MarkPaidButton({ requestId }: { requestId: string }) {
  const { pending, error, run } = useConfirmedTransition(null, () =>
    markPaid(requestId)
  );
  return (
    <span>
      <button disabled={pending} onClick={run} className="btn-secondary">
        {pending ? S.common.loading : S.lifecycle.markPaid}
      </button>
      {error && <span className="field-error block">{error}</span>}
    </span>
  );
}

export function RatingForm({ requestId }: { requestId: string }) {
  const boundAction = submitRating.bind(null, requestId);
  const [state, formAction, pending] = useActionState(boundAction, null);

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="font-semibold">{S.lifecycle.rateTitle}</h2>
      <StarsInput name="stars" />
      {state && !state.ok && state.fieldErrors?.stars && (
        <p className="field-error">{state.fieldErrors.stars}</p>
      )}
      <div>
        <label htmlFor="note" className="field-label">
          {S.lifecycle.rateNote}
        </label>
        <textarea id="note" name="note" rows={2} maxLength={500} className="field-input" />
      </div>
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? S.common.loading : S.lifecycle.rateSubmit}
      </button>
    </form>
  );
}
