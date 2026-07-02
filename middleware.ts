import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // /emergency is excluded on purpose: the page must stay provably static —
  // no session refresh, no Supabase call on its behalf (product spec §11).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|emergency|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
