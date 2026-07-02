"use client";

import { useActionState, useState, useTransition } from "react";
import { createOffer, updateOffer, withdrawOffer } from "@/actions/offers";
import { S } from "@/lib/strings";

export function OfferForm({
  requestId,
  isPaid,
  existing,
}: {
  requestId: string;
  isPaid: boolean;
  existing?: { id: string; message: string; proposedTerms: string | null };
}) {
  const action = existing
    ? updateOffer.bind(null, existing.id, requestId)
    : createOffer.bind(null, requestId);
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="card space-y-3">
      <h2 className="font-semibold">
        {existing ? S.offers.yourOffer : S.offers.offerHelp}
      </h2>
      <div>
        <label htmlFor="message" className="field-label">
          {S.offers.message}
        </label>
        <textarea
          id="message"
          name="message"
          required
          minLength={5}
          maxLength={1000}
          rows={3}
          defaultValue={existing?.message}
          className="field-input"
        />
        {state && !state.ok && state.fieldErrors?.message && (
          <p className="field-error">{state.fieldErrors.message}</p>
        )}
      </div>
      {isPaid && (
        <div>
          <label htmlFor="proposedTerms" className="field-label">
            {S.offers.proposedTerms}
          </label>
          <input
            id="proposedTerms"
            name="proposedTerms"
            maxLength={300}
            defaultValue={existing?.proposedTerms ?? ""}
            className="field-input"
          />
          {state && !state.ok && state.fieldErrors?.proposedTerms && (
            <p className="field-error">{state.fieldErrors.proposedTerms}</p>
          )}
        </div>
      )}
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      {state?.ok && <p className="text-sm text-emerald-700">{S.profile.saved}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending
            ? S.common.loading
            : existing
              ? S.offers.update
              : S.offers.submit}
        </button>
        {existing && <WithdrawButton offerId={existing.id} requestId={requestId} />}
      </div>
    </form>
  );
}

export function WithdrawButton({
  offerId,
  requestId,
}: {
  offerId: string;
  requestId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(S.offers.withdrawConfirm)) return;
        startTransition(async () => {
          await withdrawOffer(offerId, requestId);
        });
      }}
      className="btn-danger"
    >
      {S.offers.withdraw}
    </button>
  );
}

export function StarsInput({ name }: { name: string }) {
  const [value, setValue] = useState(0);
  return (
    <div className="flex flex-row-reverse justify-end gap-1 text-3xl">
      {/* visually 1..5 in RTL */}
      {[5, 4, 3, 2, 1].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setValue(n)}
          aria-label={`${n} ${S.lifecycle.stars}`}
          className={n <= value ? "text-amber-500" : "text-stone-300"}
        >
          ★
        </button>
      ))}
      <input type="hidden" name={name} value={value || ""} />
    </div>
  );
}
