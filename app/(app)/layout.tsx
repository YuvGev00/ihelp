import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/actions/auth";
import { S } from "@/lib/strings";

/**
 * Signed-in shell: session read, nav, and the first-login onboarding redirect
 * (empty display name -> /profile doubles as onboarding, spec §8.1).
 * This layout — not the root — is session-aware, keeping public routes static.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login"); // middleware already guards; belt & suspenders

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_identity_verified")
    .eq("id", user.id)
    .single();

  const { data: priv } = await supabase
    .from("profiles_private")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link href="/requests" className="text-lg font-bold text-emerald-700">
            {S.appName}
          </Link>
          <Link href="/requests" className="hover:text-emerald-700">
            {S.nav.requests}
          </Link>
          <Link href="/my/requests" className="hover:text-emerald-700">
            {S.nav.myRequests}
          </Link>
          <Link href="/my/offers" className="hover:text-emerald-700">
            {S.nav.myOffers}
          </Link>
          <Link href="/verification" className="hover:text-emerald-700">
            {S.nav.verification}
          </Link>
          {priv?.is_admin && (
            <Link href="/admin" className="font-semibold text-purple-700">
              {S.nav.admin}
            </Link>
          )}
          <span className="ms-auto flex items-center gap-4">
            <Link
              href="/emergency"
              className="font-semibold text-red-600 hover:text-red-700"
            >
              {S.nav.emergency}
            </Link>
            <Link href="/profile" className="hover:text-emerald-700">
              {profile?.display_name || S.nav.profile}
            </Link>
            <form action={signOut}>
              <button className="text-stone-500 hover:text-stone-700">
                {S.nav.signOut}
              </button>
            </form>
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
