import Link from "next/link";
import { S } from "@/lib/strings";

export const dynamic = "force-static";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-canvas">
      {/* Hero — pine→brand gradient, the reversal stated boldly, verification
          teased as the trust anchor. Decorative mint orbs add depth. */}
      <section className="relative overflow-hidden bg-gradient-to-b from-pine to-brand text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -start-16 h-64 w-64 rounded-full bg-[#7fd6b6]/20 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -end-10 h-72 w-72 rounded-full bg-[#7fd6b6]/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
          {/* Wordmark */}
          <div className="mb-8 inline-flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-white text-xl font-extrabold text-brand">
              i
            </span>
            <span className="text-2xl font-extrabold tracking-tight">
              {S.appName}
            </span>
          </div>
          <h1 className="text-4xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl">
            {S.tagline}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#c8ebdd] sm:text-lg">
            {S.landing.lead}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="rounded-xl bg-white px-6 py-3.5 text-base font-extrabold text-pine transition hover:bg-mint"
            >
              {S.common.landingSignUp}
            </Link>
            <Link
              href="/requests"
              className="rounded-xl border-[1.5px] border-white/40 px-6 py-3.5 text-base font-bold text-white transition hover:bg-white/10"
            >
              {S.common.landingCta}
            </Link>
          </div>
        </div>
      </section>

      {/* How it works — three numbered steps with mint index tiles */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-9 text-center text-2xl font-extrabold text-ink">
          {S.landing.howTitle}
        </h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {S.landing.steps.map((s) => (
            <li key={s.n} className="card">
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-mint text-lg font-extrabold text-brand">
                {s.n}
              </span>
              <h3 className="font-bold text-ink">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-body">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust — the differentiators, on a clean white band */}
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <h2 className="mb-9 text-center text-2xl font-extrabold text-ink">
            {S.landing.trustTitle}
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {S.landing.trust.map((t) => (
              <div
                key={t.title}
                className="rounded-2xl border border-mint-border bg-mint p-5 text-center"
              >
                <h3 className="font-extrabold text-pine">{t.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#3f7d68]">
                  {t.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-extrabold text-ink">
          {S.landing.ctaTitle}
        </h2>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="btn-primary text-base">
            {S.common.landingSignUp}
          </Link>
          <Link href="/login" className="btn-secondary text-base">
            {S.nav.signIn}
          </Link>
        </div>
        <p className="mt-9 text-sm text-muted">
          {S.landing.emergencyNote} —{" "}
          <Link href="/emergency" className="text-brand underline hover:text-pine">
            {S.emergency.title}
          </Link>
        </p>
      </section>
    </main>
  );
}
