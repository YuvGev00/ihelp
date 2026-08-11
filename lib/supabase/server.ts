import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

/**
 * Per-request Supabase client for Server Components and Server Actions.
 * Carries the caller's session cookie, so every DB/storage call runs under
 * RLS as the signed-in user — the app never uses the service-role key.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component where cookies are read-only:
            // safe to ignore — middleware refreshes the session.
          }
        },
      },
    }
  );
}

/**
 * Per-request-cached reads shared across the two layouts and the pages nested
 * in them. React's cache() dedupes identical calls within one server render, so
 * the layered layouts don't each re-issue getUser() / the viewer profile query.
 */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getViewerProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("display_name, is_identity_verified, is_professional")
    .eq("id", user.id)
    .single();
  return data;
});
