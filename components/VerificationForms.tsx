"use client";

import { useActionState } from "react";
import {
  submitIdentityApplication,
  submitProfessionalApplication,
} from "@/actions/verification";
import { FileUploader } from "@/components/FileUploader";
import { S } from "@/lib/strings";

export function IdentityApplicationForm() {
  const [state, formAction, pending] = useActionState(
    submitIdentityApplication,
    null
  );

  return (
    <form action={formAction} className="card space-y-4">
      <h2 className="font-extrabold text-ink">{S.verification.identityTitle}</h2>

      <div>
        <label htmlFor="fullName" className="field-label">
          {S.verification.fullName}
        </label>
        <input id="fullName" name="fullName" required className="field-input" />
        {state && !state.ok && state.fieldErrors?.fullName && (
          <p className="field-error">{state.fieldErrors.fullName}</p>
        )}
      </div>

      <div>
        <label htmlFor="phone" className="field-label">
          {S.verification.phone}
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          dir="ltr"
          required
          placeholder="0501234567"
          className="field-input"
        />
        {state && !state.ok && state.fieldErrors?.phone && (
          <p className="field-error">{state.fieldErrors.phone}</p>
        )}
      </div>

      <div>
        <label htmlFor="selfDescription" className="field-label">
          {S.verification.selfDescription}
        </label>
        <textarea
          id="selfDescription"
          name="selfDescription"
          rows={3}
          maxLength={500}
          className="field-input"
        />
      </div>

      <FileUploader
        bucket="verification-docs"
        name="docPath"
        label={S.verification.idPhoto}
      />
      {state && !state.ok && state.fieldErrors?.docPath && (
        <p className="field-error">{state.fieldErrors.docPath}</p>
      )}

      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? S.common.loading : S.verification.submit}
      </button>
    </form>
  );
}

export function ProfessionalApplicationForm({
  defaultFullName,
}: {
  defaultFullName: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitProfessionalApplication,
    null
  );

  return (
    <form action={formAction} className="card space-y-4">
      <h2 className="font-extrabold text-ink">{S.verification.professionalTitle}</h2>
      <p className="text-sm text-body">
        {S.verification.professionalExplainer}
      </p>

      <div>
        <label htmlFor="p_fullName" className="field-label">
          {S.verification.fullName}
        </label>
        <input
          id="p_fullName"
          name="fullName"
          defaultValue={defaultFullName}
          required
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="p_selfDescription" className="field-label">
          {S.verification.selfDescription}
        </label>
        <textarea
          id="p_selfDescription"
          name="selfDescription"
          rows={3}
          maxLength={500}
          className="field-input"
        />
      </div>

      <FileUploader
        bucket="verification-docs"
        name="docPath"
        label={S.verification.certificate}
      />
      {state && !state.ok && state.fieldErrors?.docPath && (
        <p className="field-error">{state.fieldErrors.docPath}</p>
      )}

      {state && !state.ok && state.formError && (
        <p className="field-error">{state.formError}</p>
      )}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? S.common.loading : S.verification.submit}
      </button>
    </form>
  );
}
