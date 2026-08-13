import { createClient, getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { GeolocationPrompt } from "@/components/GeolocationPrompt";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Badge, Stars } from "@/components/ui";
import { S } from "@/lib/strings";

export default async function ProfilePage() {
  const user = await getUser();
  const supabase = await createClient();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: priv }, { data: myRatings }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name, avatar_path, is_identity_verified, is_professional")
        .eq("id", user.id)
        .single(),
      supabase
        .from("profiles_private")
        .select("phone, lat, lng")
        .eq("user_id", user.id)
        .single(),
      // The user's own overall helper rating (same view the public sees).
      supabase.from("helper_ratings").select("stars").eq("helper_id", user.id),
    ]);

  const ratingCount = myRatings?.length ?? 0;
  const ratingAvg = ratingCount
    ? myRatings!.reduce((sum, r) => sum + r.stars, 0) / ratingCount
    : null;

  const isOnboarding = !profile?.display_name;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">{S.profile.title}</h1>
        <Badge
          verified={profile?.is_identity_verified}
          professional={profile?.is_professional}
        />
      </div>

      {isOnboarding && (
        <p className="rounded-2xl border border-mint-border bg-mint p-3 text-sm font-semibold text-pine">
          {S.profile.onboardingHint}
        </p>
      )}

      {/* The user's own overall rating as a helper — the same aggregate that
          appears next to their offers, so they can track their reputation. */}
      {!isOnboarding && (
        <section className="card flex items-center justify-between">
          <h2 className="font-extrabold text-ink">{S.profile.myRating}</h2>
          <Stars value={ratingAvg} count={ratingCount} />
        </section>
      )}

      <ProfileForm
        displayName={profile?.display_name ?? ""}
        phone={priv?.phone ?? null}
        avatarPath={profile?.avatar_path ?? null}
      />

      <section className="card">
        <h2 className="mb-2 font-extrabold text-ink">{S.profile.location}</h2>
        <GeolocationPrompt hasLocation={priv?.lat != null} />
      </section>

      {/* Renders nothing unless the app is installable and not already installed */}
      <InstallPrompt />
    </div>
  );
}
