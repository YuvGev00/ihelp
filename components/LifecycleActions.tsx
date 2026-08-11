"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignOffer,
  cancelRequest,
  confirmCompletion,
  markPaid,
} from "@/actions/requests";
import { submitRating } from "@/actions/ratings";
import { setFinalPrice } from "@/actions/offers";
import { StarsInput } from "@/components/OfferForm";
import { S } from "@/lib/strings";

/**
 * Runs a server action inside a transition, optionally behind a confirm dialog,
 * and surfaces its formError so no failure is silent. On failure it also
 * refreshes the route so a stale server-rendered view (e.g. an offer the
 * requester just assigned out from under the helper) re-syncs.
 */
export function useConfirmedTransition(
  confirmMessage: string | null,
  fn: () => Promise<{ ok: boolean; formError?: string }>
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = () => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setError(null);
      } else {
        setError(result.formError ?? null);
        router.refresh();
      }
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

/** The selected helper of an after_job offer sets the final amount, shown once
 *  the request is completed and no final price has been set yet. */
export function SetFinalPriceForm({ requestId }: { requestId: string }) {
  const boundAction = setFinalPrice.bind(null, requestId);
  const [state, formAction, pending] = useActionState(boundAction, null);

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="font-extrabold text-ink">{S.offers.setFinalPriceTitle}</h2>
      <p className="text-sm text-body">{S.offers.setFinalPriceHint}</p>
      <div>
        <label htmlFor="finalPrice" className="field-label">
          {S.offers.price}
        </label>
        <input
          id="finalPrice"
          name="price"
          type="number"
          min="1"
          max="99999.99"
          step="0.01"
          dir="ltr"
          required
          className="field-input"
        />
        {state && !state.ok && state.fieldErrors?.price && (
          <p className="field-error">{state.fieldErrors.price}</p>
        )}
      </div>
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? S.common.loading : S.offers.setFinalPriceSubmit}
      </button>
    </form>
  );
}

export function RatingForm({ requestId }: { requestId: string }) {
  const boundAction = submitRating.bind(null, requestId);
  const [state, formAction, pending] = useActionState(boundAction, null);

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="text-center font-extrabold text-ink">{S.lifecycle.rateTitle}</h2>
      <div className="flex justify-center">
        <StarsInput name="stars" />
      </div>
      {state && !state.ok && state.fieldErrors?.stars && (
        <p className="text-center field-error">{state.fieldErrors.stars}</p>
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
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? S.common.loading : S.lifecycle.rateSubmit}
      </button>
    </form>
  );
}
