/**
 * Resets the password of every demo account (@ihelp.demo) via the Admin API.
 * Non-destructive: updates existing users in place, no delete/reseed, so all
 * their requests/offers/ratings/avatars are preserved.
 *
 * Run:  RESET_URL=<project-url> RESET_KEY=<service-role-key> \
 *       DEMO_PASSWORD=demo1234 npx tsx scripts/reset-demo-password.mts
 *
 * Targets whichever project RESET_URL/RESET_KEY point at — local or cloud.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.RESET_URL;
const key = process.env.RESET_KEY;
const newPassword = process.env.DEMO_PASSWORD;

if (!url || !key || !newPassword) {
  console.error("Missing RESET_URL, RESET_KEY, or DEMO_PASSWORD");
  process.exit(1);
}
if (newPassword.length < 6) {
  console.error("DEMO_PASSWORD must be at least 6 characters (Supabase floor)");
  process.exit(1);
}

const db = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// List all users (demo project is tiny; one page is plenty) and update the
// @ihelp.demo accounts.
const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
if (error) {
  console.error("listUsers failed:", error.message);
  process.exit(1);
}

const demoUsers = data.users.filter((u) => u.email?.endsWith("@ihelp.demo"));
if (!demoUsers.length) {
  console.error("No @ihelp.demo users found on this project.");
  process.exit(1);
}

let ok = 0;
for (const u of demoUsers) {
  const { error: upErr } = await db.auth.admin.updateUserById(u.id, {
    password: newPassword,
  });
  if (upErr) {
    console.error(`  ✗ ${u.email}: ${upErr.message}`);
  } else {
    console.log(`  ✓ ${u.email}`);
    ok++;
  }
}
console.log(`\nUpdated ${ok}/${demoUsers.length} demo passwords to "${newPassword}".`);
