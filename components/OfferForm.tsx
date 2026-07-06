"use client";

import { useActionState, useState, useTransition } from "react";
import { createOffer, updateOffer, withdrawOffer } from "@/actions/offers";
import { S } from "@/lib/strings";

type PricingMode = "fixed" | "volunteer" | "after_job";

export function OfferForm({
  requestId,
  isPaid,
  existing,
}: {
  requestId: string;
  isPaid: boolean;
  existing?: {
    id: string;
    message: string;
    price: number | null;
    pricingMode: PricingMode;
  };
}) {
  const action = existing
    ? updateOffer.bind(null, existing.id, requestId)
    : createOffer.bind(null, requestId);
  const [state, formAction, pending] = useActionState(action, null);
  // pricing_mode is immutable once set; on edit it is shown read-only.
  const [mode, setMode] = useState<PricingMode>(
    existing?.pricingMode ?? (isPaid ? "fixed" : "volunteer")
  );

  // On a volunteer request the only valid stance is volunteering.
  const modeOptions: PricingMode[] = isPaid
    ? ["fixed", "after_job", "volunteer"]
    : ["volunteer"];

  const modeLabel: Record<PricingMode, string> = {
    fixed: S.offers.modeFixed,
    volunteer: S.offers.modeVolunteer,
    after_job: S.offers.modeAfterJob,
  };

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
        <fieldset>
          <legend className="field-label">{S.offers.pricingLabel}</legend>
          {existing ? (
            // pricing_mode cannot change after the offer exists (column guard)
            <input type="hidden" name="pricingMode" value={mode} />
          ) : null}
          <div className="space-y-1.5">
            {modeOptions.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={existing ? undefined : "pricingMode"}
                  value={m}
                  checked={mode === m}
                  disabled={!!existing}
                  onChange={() => setMode(m)}
                />
                {modeLabel[m]}
              </label>
            ))}
          </div>
          {mode === "after_job" && (
            <p className="mt-1 text-xs text-stone-500">
              {S.offers.modeAfterJobHint}
            </p>
          )}
        </fieldset>
      )}
      {!isPaid && <input type="hidden" name="pricingMode" value="volunteer" />}

      {mode === "fixed" && (
        <div>
          <label htmlFor="price" className="field-label">
            {S.offers.price}
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min="1"
            max="99999.99"
            step="0.01"
            dir="ltr"
            required
            defaultValue={existing?.price ?? ""}
            className="field-input"
          />
          {state && !state.ok && state.fieldErrors?.price && (
            <p className="field-error">{state.fieldErrors.price}</p>
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
