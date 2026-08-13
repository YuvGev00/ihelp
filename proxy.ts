import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Excluded from session-refresh + auth redirects:
  // - /emergency: must stay provably static (product spec §11)
  // - /api/health: public keep-alive endpoint — reachable unauthenticated
  // - manifest + icons: the PWA manifest and its icons must load for the
  //   install prompt, with no session
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|emergency|api/health|manifest.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
