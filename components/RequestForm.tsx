"use client";

import { useActionState, useState } from "react";
import { createRequest, updateRequest } from "@/actions/requests";
import { FileUploader } from "@/components/FileUploader";
import { CATEGORIES } from "@/lib/categories";
import { S } from "@/lib/strings";

function PaymentFields({
  defaultType,
  defaultAmount,
  fieldErrors,
}: {
  defaultType: "paid" | "volunteer";
  defaultAmount?: number | null;
  fieldErrors?: Record<string, string>;
}) {
  const [paymentType, setPaymentType] = useState<"paid" | "volunteer">(defaultType);
  return (
    <>
      <fieldset>
        <legend className="field-label">{S.requests.paymentType}</legend>
        <div className="flex gap-4">
          {(["volunteer", "paid"] as const).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="paymentType"
                value={t}
                checked={paymentType === t}
                onChange={() => setPaymentType(t)}
              />
              {t === "paid" ? S.requests.paid : S.requests.volunteer}
            </label>
          ))}
        </div>
      </fieldset>
      {paymentType === "paid" && (
        <div>
          <label htmlFor="amount" className="field-label">
            {S.requests.amount}
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="1"
            max="99999.99"
            step="0.01"
            dir="ltr"
            defaultValue={defaultAmount ?? ""}
            required
            className="field-input"
          />
          {fieldErrors?.amount && <p className="field-error">{fieldErrors.amount}</p>}
        </div>
      )}
    </>
  );
}

function CoreFields({
  defaults,
  fieldErrors,
}: {
  defaults?: { title: string; description: string; category: string };
  fieldErrors?: Record<string, string>;
}) {
  return (
    <>
      <div>
        <label htmlFor="title" className="field-label">
          {S.requests.title}
        </label>
        <input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={80}
          defaultValue={defaults?.title}
          className="field-input"
        />
        {fieldErrors?.title && <p className="field-error">{fieldErrors.title}</p>}
      </div>

      <div>
        <label htmlFor="description" className="field-label">
          {S.requests.description}
        </label>
        <textarea
          id="description"
          name="description"
          required
          minLength={10}
          maxLength={2000}
          rows={5}
          defaultValue={defaults?.description}
          className="field-input"
        />
        {fieldErrors?.description && (
          <p className="field-error">{fieldErrors.description}</p>
        )}
      </div>

      <div>
        <label htmlFor="category" className="field-label">
          {S.requests.category}
        </label>
        <select
          id="category"
          name="category"
          required
          defaultValue={defaults?.category ?? ""}
          className="field-input"
        >
          <option value="" disabled>
            {S.requests.category}…
          </option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        {fieldErrors?.category && (
          <p className="field-error">{fieldErrors.category}</p>
        )}
      </div>
    </>
  );
}

/** Location confirm (spec §8.3): profile default, or capture on the spot. */
function LocationField({
  profileLocation,
  fieldError,
}: {
  profileLocation: { lat: number; lng: number } | null;
  fieldError?: string;
}) {
  const [loc, setLoc] = useState(profileLocation);
  const [status, setStatus] = useState<"idle" | "busy" | "denied">("idle");

  function capture() {
    setStatus("busy");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("idle");
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }

  return (
    <div>
      <span className="field-label">{S.requests.location}</span>
      {loc ? (
        <p className="text-sm text-emerald-700">
          {S.profile.locationSet}{" "}
          {loc === profileLocation && `(${S.requests.locationFromProfile})`}
        </p>
      ) : (
        <p className="text-sm text-stone-500">{S.profile.locationUnset}</p>
      )}
      <button
        type="button"
        onClick={capture}
        disabled={status === "busy"}
        className="btn-secondary mt-1"
      >
        {status === "busy" ? S.common.loading : S.requests.locationConfirm}
      </button>
      {status === "denied" && (
        <p className="field-error">{S.profile.locationDenied}</p>
      )}
      {loc && (
        <>
          <input type="hidden" name="lat" value={loc.lat} />
          <input type="hidden" name="lng" value={loc.lng} />
        </>
      )}
      {fieldError && <p className="field-error">{fieldError}</p>}
    </div>
  );
}

export function NewRequestForm({
  profileLocation,
}: {
  profileLocation: { lat: number; lng: number } | null;
}) {
  const [state, formAction, pending] = useActionState(createRequest, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="card space-y-4">
      <CoreFields fieldErrors={fieldErrors} />
      <PaymentFields defaultType="volunteer" fieldErrors={fieldErrors} />
      <FileUploader
        bucket="request-photos"
        name="photoPaths"
        maxFiles={5}
        label={S.requests.photos}
        hint={S.requests.photosHint}
      />
      {fieldErrors?.photoPaths && (
        <p className="field-error">{fieldErrors.photoPaths}</p>
      )}
      <LocationField
        profileLocation={profileLocation}
        fieldError={fieldErrors?.lat ?? fieldErrors?.lng}
      />
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? S.common.loading : S.requests.publish}
      </button>
    </form>
  );
}

export function EditRequestForm({
  requestId,
  defaults,
}: {
  requestId: string;
  defaults: {
    title: string;
    description: string;
    category: string;
    paymentType: "paid" | "volunteer";
    amount: number | null;
  };
}) {
  const boundAction = updateRequest.bind(null, requestId);
  const [state, formAction, pending] = useActionState(boundAction, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="card space-y-4">
      <h2 className="font-semibold">{S.requests.edit}</h2>
      <CoreFields defaults={defaults} fieldErrors={fieldErrors} />
      <PaymentFields
        defaultType={defaults.paymentType}
        defaultAmount={defaults.amount}
        fieldErrors={fieldErrors}
      />
      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}
      {state?.ok && <p className="text-sm text-emerald-700">{S.profile.saved}</p>}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? S.common.loading : S.requests.saveChanges}
      </button>
    </form>
  );
}
