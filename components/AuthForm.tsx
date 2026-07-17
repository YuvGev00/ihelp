"use client";

import { useActionState } from "react";
import Link from "next/link";
import { S } from "@/lib/strings";
import type { ActionResult } from "@/lib/errors";

type AuthAction = (
  prev: ActionResult | null,
  formData: FormData
) => Promise<ActionResult>;

export function AuthForm({
  mode,
  action,
}: {
  mode: "signin" | "signup";
  action: AuthAction;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const isSignUp = mode === "signup";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 flex flex-col items-center text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-3xl font-extrabold text-white">
          i
        </span>
        <h1 className="text-2xl font-extrabold text-ink">
          {isSignUp ? S.auth.signUpTitle : S.auth.signInTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{S.tagline}</p>
      </div>

      <form action={formAction} className="card space-y-4">
        <div>
          <label htmlFor="email" className="field-label">
            {S.auth.email}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            dir="ltr"
            className="field-input"
            autoComplete="email"
          />
          {state && !state.ok && state.fieldErrors?.email && (
            <p className="field-error">{state.fieldErrors.email}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className="field-label">
            {S.auth.password}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={isSignUp ? 8 : 1}
            dir="ltr"
            className="field-input"
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
          {isSignUp && (
            <p className="mt-1 text-xs text-muted">{S.auth.passwordHint}</p>
          )}
          {state && !state.ok && state.fieldErrors?.password && (
            <p className="field-error">{state.fieldErrors.password}</p>
          )}
        </div>

        {state && !state.ok && state.formError && (
          <p className="field-error">{state.formError}</p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending
            ? S.common.loading
            : isSignUp
              ? S.auth.signUpAction
              : S.auth.signInAction}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-body">
        {isSignUp ? S.auth.haveAccount : S.auth.noAccount}{" "}
        <Link
          href={isSignUp ? "/login" : "/signup"}
          className="font-bold text-brand underline"
        >
          {isSignUp ? S.nav.signIn : S.nav.signUp}
        </Link>
      </p>
    </main>
  );
}
