import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser, getViewerProfile } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import { NavLinks } from "@/components/NavLinks";
import { BottomNav } from "@/components/BottomNav";
import { S } from "@/lib/strings";

/**
 * Signed-in shell: session read, nav, and the first-login onboarding redirect
 * (empty display name -> /profile doubles as onboarding, spec §8.1).
 * This layout — not the root — is session-aware, keeping public routes static.
 *
 * Responsive: on desktop a centered top nav; on phones a compact brand bar
 * up top and a native bottom tab bar (components/BottomNav).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser(); // cached — shared with (onboarded) layout + pages
  if (!user) redirect("/login"); // middleware already guards; belt & suspenders

  const supabase = await createClient();
  const [profile, { data: priv }] = await Promise.all([
    getViewerProfile(), // cached — reused by pages that need the verified flag
    supabase
      .from("profiles_private")
      .select("is_admin")
      .eq("user_id", user.id)
      .single(),
  ]);

  return (
    <div className="min-h-screen">
      {/* Desktop nav — centered, full link set */}
      <header className="hidden border-b border-line bg-white md:block">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link
            href="/requests"
            className="flex items-center gap-2 text-lg font-extrabold text-pine"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">
              i
            </span>
            {S.appName}
          </Link>
          <NavLinks isAdmin={!!priv?.is_admin} />
          <span className="ms-auto flex items-center gap-4">
            <Link
              href="/emergency"
              className="font-semibold text-red-600 hover:text-red-700"
            >
              {S.nav.emergency}
            </Link>
            <Link href="/profile" className="hover:text-brand">
              {profile?.display_name || S.nav.profile}
            </Link>
            <form action={signOut}>
              <button className="text-muted hover:text-ink">
                {S.nav.signOut}
              </button>
            </form>
          </span>
        </nav>
      </header>

      {/* Mobile brand bar — compact; primary nav lives in the bottom tab bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-white px-4 py-3 md:hidden">
        <Link href="/requests" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand text-sm font-extrabold text-white">
            i
          </span>
          <span className="text-lg font-extrabold text-pine">{S.appName}</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {priv?.is_admin && (
            <Link href="/admin" className="font-semibold text-purple-700">
              {S.nav.admin}
            </Link>
          )}
          <Link href="/verification" className="text-body hover:text-brand">
            {S.nav.verification}
          </Link>
          <Link
            href="/emergency"
            aria-label={S.nav.emergency}
            className="font-bold text-red-600"
          >
            {S.emergency.title}
          </Link>
        </div>
      </header>

      {/* Extra bottom padding on mobile so content clears the tab bar */}
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
