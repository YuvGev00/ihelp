import Link from "next/link";
import { S } from "@/lib/strings";

export const dynamic = "force-static";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-5xl font-bold text-emerald-700">{S.appName}</h1>
      <p className="text-xl text-stone-700">{S.tagline}</p>
      <p className="max-w-md text-stone-500">
        במקום לחפש איש מקצוע — מפרסמים בקשה, ועוזרים מאומתים בסביבה מציעים
        סיוע. בתשלום או בהתנדבות, ותמיד עם אדם מאומת בצד השני.
      </p>
      <div className="flex gap-3">
        <Link href="/signup" className="btn-primary">
          {S.common.landingSignUp}
        </Link>
        <Link href="/requests" className="btn-secondary">
          {S.common.landingCta}
        </Link>
      </div>
      <Link href="/emergency" className="text-sm text-stone-400 underline">
        {S.emergency.title}
      </Link>
    </main>
  );
}
