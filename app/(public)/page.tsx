import Link from "next/link";
import { S } from "@/lib/strings";

export const dynamic = "force-static";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Hero — warm gradient, generous space, the reversal stated boldly */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-50 via-stone-50 to-stone-50"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 start-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-6 pb-16 pt-24 text-center">
          <span className="chip mb-6 bg-white/70 text-emerald-800 ring-1 ring-emerald-200">
            RUNI · Internet Technologies 2026
          </span>
          <h1 className="text-6xl font-extrabold tracking-tight text-emerald-700">
            {S.appName}
          </h1>
          <p className="mt-4 text-2xl font-semibold text-stone-800">
            {S.tagline}
          </p>
          <p className="mx-auto mt-4 max-w-xl text-stone-600">
            {S.landing.lead}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="btn-primary px-6 py-3 text-base">
              {S.common.landingSignUp}
            </Link>
            <Link href="/requests" className="btn-secondary px-6 py-3 text-base">
              {S.common.landingCta}
            </Link>
          </div>
        </div>
      </section>

      {/* How it works — three numbered steps */}
      <section className="mx-auto max-w-4xl px-6 py-14">
        <h2 className="mb-8 text-center text-2xl font-bold text-stone-800">
          {S.landing.howTitle}
        </h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {S.landing.steps.map((s) => (
            <li key={s.n} className="card relative pt-8">
              <span className="absolute -top-4 end-4 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white shadow-sm">
                {s.n}
              </span>
              <h3 className="font-bold text-stone-800">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Trust — the differentiators */}
      <section className="bg-white">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <h2 className="mb-8 text-center text-2xl font-bold text-stone-800">
            {S.landing.trustTitle}
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {S.landing.trust.map((t) => (
              <div key={t.title} className="text-center">
                <h3 className="font-bold text-emerald-700">{t.title}</h3>
                <p className="mt-1 text-sm text-stone-600">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-stone-800">
          {S.landing.ctaTitle}
        </h2>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">
            {S.common.landingSignUp}
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            {S.nav.signIn}
          </Link>
        </div>
        <p className="mt-8 text-sm text-stone-400">
          {S.landing.emergencyNote} —{" "}
          <Link href="/emergency" className="underline hover:text-stone-600">
            {S.emergency.title}
          </Link>
        </p>
      </section>
    </div>
  );
}
