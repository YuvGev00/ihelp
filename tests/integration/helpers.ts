/**
 * Integration-test harness: real clients against the LOCAL Supabase stack.
 * Each suite creates throwaway users through the same paths real users take;
 * the service-role client is used only for the two things the design reserves
 * for local tooling: creating auth users and flipping is_admin (manual SQL).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvLocal(): Record<string, string> {
  try {
    const text = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

const envFile = loadEnvLocal();
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFile.NEXT_PUBLIC_SUPABASE_URL;
export const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? envFile.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? envFile.SUPABASE_SERVICE_ROLE_KEY;

/** Integration tests only run against a local stack. */
export const stackConfigured = Boolean(
  SUPABASE_URL?.includes("127.0.0.1") && ANON_KEY && SERVICE_KEY
);

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let userSeq = 0;

/** Creates a fresh auth user and returns a signed-in client acting as them. */
export async function newUser(
  label: string
): Promise<{ client: SupabaseClient; id: string; email: string }> {
  const email = `t-${Date.now()}-${userSeq++}-${label}@test.local`;
  const password = "test-password-1234";
  const svc = serviceClient();
  const { data, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);

  const client = anonClient();
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (signInErr) throw new Error(`signIn(${label}): ${signInErr.message}`);
  return { client, id: data.user.id, email };
}

/** Admin flag is set manually in SQL by design — service role stands in. */
export async function makeAdmin(userId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("profiles_private")
    .update({ is_admin: true })
    .eq("user_id", userId);
  if (error) throw new Error(`makeAdmin: ${error.message}`);
}

/** Runs the REAL verification flow: user applies, admin approves via RPC. */
export async function verifyIdentity(
  user: { client: SupabaseClient; id: string },
  admin: { client: SupabaseClient },
  phone = "0501234567"
): Promise<void> {
  const { data: app, error } = await user.client
    .from("verification_applications")
    .insert({
      user_id: user.id,
      kind: "identity",
      full_name: "משתמש בדיקה",
      self_description: "fixture",
      phone,
    })
    .select("id")
    .single();
  if (error) throw new Error(`apply: ${error.message}`);

  const { error: reviewErr } = await admin.client.rpc("review_application", {
    p_application_id: app.id,
    p_approve: true,
    p_note: null,
  });
  if (reviewErr) throw new Error(`approve: ${reviewErr.message}`);
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

/** Uploads a photo as the user (storage policy requires verified identity). */
export async function uploadPhoto(user: {
  client: SupabaseClient;
  id: string;
}): Promise<string> {
  const path = `${user.id}/${crypto.randomUUID()}.png`;
  const { error } = await user.client.storage
    .from("request-photos")
    .upload(path, TINY_PNG, { contentType: "image/png" });
  if (error) throw new Error(`upload: ${error.message}`);
  return path;
}

/** Full happy-path fixture: verified requester + photo + open request. */
export async function createRequestFixture(
  requester: { client: SupabaseClient; id: string },
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const photo = await uploadPhoto(requester);
  const { data, error } = await requester.client.rpc(
    "create_request_with_photos",
    {
      p_title: "בקשת בדיקה",
      p_description: "תיאור ארוך מספיק לבדיקות אינטגרציה",
      p_category: "repairs",
      p_payment_type: "paid",
      p_amount: 100,
      p_lat: 32.08,
      p_lng: 34.78,
      p_photo_paths: [photo],
      ...overrides,
    }
  );
  if (error) throw new Error(`create_request: ${error.message}`);
  return data as string;
}
