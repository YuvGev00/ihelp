import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { GeolocationPrompt } from "@/components/GeolocationPrompt";
import { Badge } from "@/components/ui";
import { S } from "@/lib/strings";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: priv }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, is_identity_verified, is_professional")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles_private")
      .select("phone, lat, lng")
      .eq("user_id", user.id)
      .single(),
  ]);

  const isOnboarding = !profile?.display_name;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{S.profile.title}</h1>
        <Badge
          verified={profile?.is_identity_verified}
          professional={profile?.is_professional}
        />
      </div>

      {isOnboarding && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {S.profile.onboardingHint}
        </p>
      )}

      <ProfileForm
        displayName={profile?.display_name ?? ""}
        phone={priv?.phone ?? null}
      />

      <section className="card">
        <h2 className="mb-2 font-semibold">{S.profile.location}</h2>
        <GeolocationPrompt hasLocation={priv?.lat != null} />
      </section>
    </div>
  );
}
