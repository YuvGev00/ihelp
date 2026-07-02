import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — used only where the browser must talk to Supabase
 * directly: direct-to-storage photo uploads (Server Actions cap request bodies,
 * so files never proxy through the app server).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
