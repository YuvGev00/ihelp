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
      <p className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        {S.verification.pending}
      </p>
    );
  }
  if (app.status === "rejected" || app.status === "revoked") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
        <p className="font-semibold">{S.verification.rejected}</p>
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
        <h1 className="text-2xl font-bold">{S.verification.title}</h1>
        <Badge verified={identityVerified} professional={isProfessional} />
      </div>

      <p className="text-sm text-stone-600">{S.verification.explainer}</p>

      {/* Identity track */}
      {identityVerified ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
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
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
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
