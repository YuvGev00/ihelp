import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  IdentityApplicationForm,
  ProfessionalApplicationForm,
} from "@/components/VerificationForms";
import { Badge } from "@/components/ui";
import { S } from "@/lib/strings";

type Application = {
  id: string;
  kind: "identity" | "professional";
  status: "pending" | "approved" | "rejected" | "revoked";
  full_name: string;
  admin_note: string | null;
  created_at: string;
};

function latestByKind(apps: Application[], kind: Application["kind"]) {
  return apps.find((a) => a.kind === kind) ?? null;
}

function ApplicationStatus({ app }: { app: Application }) {
  if (app.status === "pending") {
    return (
      <p className="rounded-2xl border border-price-border bg-price-bg p-3 text-sm font-semibold text-price">
        ● {S.verification.pending}
      </p>
    );
  }
  if (app.status === "rejected" || app.status === "revoked") {
    // A revoked verification was approved and later cancelled — not a failed
    // application; say so honestly rather than "your request was rejected".
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <p className="font-bold">
          {app.status === "revoked"
            ? S.verification.revoked
            : S.verification.rejected}
        </p>
        {app.admin_note && (
          <p>
            {S.verification.rejectedNote}: {app.admin_note}
          </p>
        )}
      </div>
    );
  }
  return null;
}

export default async function VerificationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: apps }] = await Promise.all([
    supabase
      .from("profiles")
      .select("is_identity_verified, is_professional")
      .eq("id", user.id)
      .single(),
    supabase
      .from("verification_applications")
      .select("id, kind, status, full_name, admin_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const applications = (apps ?? []) as Application[];
  const identityApp = latestByKind(applications, "identity");
  const professionalApp = latestByKind(applications, "professional");

  const identityVerified = profile?.is_identity_verified ?? false;
  const isProfessional = profile?.is_professional ?? false;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">{S.verification.title}</h1>
        <Badge verified={identityVerified} professional={isProfessional} />
      </div>

      {/* Explainer — verification is the trust hero, framed with a lock */}
      <div className="flex gap-3 rounded-2xl border border-mint-border bg-mint p-4">
        <span className="text-xl leading-none">🔒</span>
        <p className="text-sm leading-relaxed text-[#2c5a4a]">
          {S.verification.explainer}
        </p>
      </div>

      {/* Identity track */}
      {identityVerified ? (
        <p className="rounded-2xl border border-mint-border bg-mint p-3 text-sm font-semibold text-pine">
          {S.verification.identityTitle}: {S.verification.approved}
        </p>
      ) : identityApp?.status === "pending" ? (
        <ApplicationStatus app={identityApp} />
      ) : (
        <>
          {identityApp && <ApplicationStatus app={identityApp} />}
          <IdentityApplicationForm />
        </>
      )}

      {/* Professional track — unlocked by identity verification */}
      {identityVerified &&
        (isProfessional ? (
          <p className="rounded-2xl border border-[#cddcff] bg-pro-bg p-3 text-sm font-semibold text-pro">
            {S.verification.professionalTitle}: {S.verification.approved}
          </p>
        ) : professionalApp?.status === "pending" ? (
          <ApplicationStatus app={professionalApp} />
        ) : (
          <>
            {professionalApp && <ApplicationStatus app={professionalApp} />}
            <ProfessionalApplicationForm
              defaultFullName={identityApp?.full_name ?? ""}
            />
          </>
        ))}
    </div>
  );
}
