import { redirect } from "next/navigation";
import { getUser, getViewerProfile } from "@/lib/supabase/server";

/**
 * Onboarding gate (spec §8.1): a user with no display name is sent to
 * /profile, which doubles as the onboarding step. /profile itself lives
 * outside this group, so there is no redirect loop.
 *
 * Both reads are the per-request-cached helpers, so this layer adds no extra
 * round-trips over the parent (app) layout.
 */
export default async function OnboardedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getViewerProfile();
  if (!profile?.display_name) redirect("/profile");

  return <>{children}</>;
}
