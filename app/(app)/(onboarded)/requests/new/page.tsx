import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewRequestForm } from "@/components/RequestForm";
import { S } from "@/lib/strings";

/** Posting requires identity verification (spec §8.3) — gate redirects to the flow. */
export default async function NewRequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: priv }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_identity_verified")
      .eq("id", user.id)
      .single(),
    supabase
      .from("profiles_private")
      .select("lat, lng")
      .eq("user_id", user.id)
      .single(),
  ]);

  if (!profile?.is_identity_verified) redirect("/verification");

  const profileLocation =
    priv?.lat != null && priv?.lng != null
      ? { lat: priv.lat, lng: priv.lng }
      : null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">{S.requests.newRequest}</h1>
      <NewRequestForm profileLocation={profileLocation} />
    </div>
  );
}
