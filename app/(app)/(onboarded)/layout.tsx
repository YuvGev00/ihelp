import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Onboarding gate (spec §8.1): a user with no display name is sent to
 * /profile, which doubles as the onboarding step. /profile itself lives
 * outside this group, so there is no redirect loop.
 */
export default async function OnboardedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  if (!profile?.display_name) redirect("/profile");

  return <>{children}</>;
}
