/**
 * Demo/dev seeding (design doc 03 §12).
 *
 * Auth users cannot be reliably created by plain SQL (the auth schema is
 * GoTrue-owned), so this script uses the service-role admin API — the ONE
 * sanctioned local-tooling use of that key (architecture §9). It is never
 * part of the deployed app.
 *
 * Run:  npx tsx scripts/seed.ts
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Dataset: 1 admin, 4 identity-verified users (1 professional), 1 unverified,
 * requests in every lifecycle state (+1 hidden), offers in every status,
 * ratings so averages render.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
  process.exit(1);
}

// Service-role client: bypasses RLS; the column-guard trigger passes it
// (current_user is not 'authenticated'). Seeding writes states directly.
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "ihelp-demo-1234";

const USERS = [
  { key: "admin", email: "admin@ihelp.demo", name: "מנהל המערכת", phone: "0500000001", admin: true, verified: true },
  { key: "dana", email: "dana@ihelp.demo", name: "דנה לוי", phone: "0500000002", verified: true, professional: false },
  { key: "yossi", email: "yossi@ihelp.demo", name: "יוסי כהן — חשמלאי מוסמך", phone: "0500000003", verified: true, professional: true },
  { key: "rina", email: "rina@ihelp.demo", name: "רינה ברק", phone: "0500000004", verified: true },
  { key: "amir", email: "amir@ihelp.demo", name: "אמיר שלו", phone: "0500000005", verified: true },
  { key: "noa", email: "noa@ihelp.demo", name: "נועה פרידמן", phone: null, verified: false },
] as const;

// Tel Aviv-ish coordinates, slightly spread for meaningful distance sorting.
const GEO = { lat: 32.08, lng: 34.78 };
const jitter = (i: number) => ({
  lat: GEO.lat + (i % 5) * 0.01,
  lng: GEO.lng + ((i * 3) % 7) * 0.01,
});

async function main() {
  const ids: Record<string, string> = {};

  // 1. Auth users (trigger creates both profile rows)
  for (const u of USERS) {
    const { data, error } = await db.auth.admin.createUser({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) {
      // idempotency: look up existing user by listing
      const { data: list } = await db.auth.admin.listUsers();
      const existing = list?.users.find((x) => x.email === u.email);
      if (!existing) throw error;
      ids[u.key] = existing.id;
    } else {
      ids[u.key] = data.user.id;
    }
  }
  console.log("users:", Object.keys(ids).join(", "));

  // 2. Profiles + private rows
  for (const [i, u] of USERS.entries()) {
    const g = jitter(i);
    await db.from("profiles").update({
      display_name: u.name,
      is_identity_verified: u.verified,
      is_professional: "professional" in u ? !!u.professional : false,
    }).eq("id", ids[u.key]);
    await db.from("profiles_private").update({
      phone: u.phone,
      lat: g.lat,
      lng: g.lng,
      is_admin: "admin" in u ? !!u.admin : false,
    }).eq("user_id", ids[u.key]);
  }

  // 3. Approved identity applications (audit trail behind the flags)
  for (const u of USERS.filter((u) => u.verified)) {
    await db.from("verification_applications").insert({
      user_id: ids[u.key],
      kind: "identity",
      status: "approved",
      full_name: u.name,
      self_description: "משתמש/ת דמו",
      phone: u.phone ?? "0500000000",
      decided_by: ids.admin,
      decided_at: new Date().toISOString(),
    });
  }
  await db.from("verification_applications").insert({
    user_id: ids.yossi,
    kind: "professional",
    status: "approved",
    full_name: "יוסי כהן",
    self_description: "חשמלאי מוסמך, 12 שנות ניסיון",
    decided_by: ids.admin,
    decided_at: new Date().toISOString(),
  });
  // one pending identity application for the admin queue demo
  await db.from("verification_applications").insert({
    user_id: ids.noa,
    kind: "identity",
    status: "pending",
    full_name: "נועה פרידמן",
    self_description: "שמחה לעזור לשכנים באזור",
    phone: "0500000006",
  });

  // 4. Requests across the lifecycle. Seed inserts set states directly
  // (service role passes the column guard); photos are omitted — the RPC path
  // that enforces them is for real users, and seeded cards render without.
  const req = async (fields: Record<string, unknown>) => {
    const { data, error } = await db
      .from("help_requests")
      .insert({ lat: GEO.lat, lng: GEO.lng, ...fields })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  const openReq = await req({
    requester_id: ids.dana,
    title: "עזרה בהרכבת ארון",
    description: "ארון איקאה שהגיע בקרטונים, צריך שעתיים של עבודה משותפת.",
    category: "repairs",
    payment_type: "paid",
    amount: 150,
  });

  const offersReq = await req({
    requester_id: ids.rina,
    title: "תיקון דוד חשמל",
    description: "הדוד מפסיק לחמם. דרוש חשמלאי מוסמך לבדיקה.",
    category: "electricity",
    payment_type: "paid",
    amount: 300,
  });

  const assignedReq = await req({
    requester_id: ids.dana,
    title: "ליווי לקופת חולים",
    description: "סבתא שלי צריכה ליווי לתור בבוקר, כשעה וחצי.",
    category: "errands",
    payment_type: "volunteer",
  });

  const completedReq = await req({
    requester_id: ids.amir,
    title: "עזרה בהעברת ספה",
    description: "להוריד ספה שלוש קומות ולהעמיס על טנדר.",
    category: "moving",
    payment_type: "paid",
    amount: 120,
  });

  const ratedReq = await req({
    requester_id: ids.rina,
    title: "התקנת מדפסת ומחשב",
    description: "מחשב חדש שצריך להעביר אליו הכל ולהתקין מדפסת.",
    category: "tech_help",
    payment_type: "paid",
    amount: 100,
  });

  await req({
    requester_id: ids.amir,
    title: "השקיית גינה בחופשה",
    description: "שבוע בחו\"ל, צריך השקיה פעמיים.",
    category: "gardening",
    payment_type: "volunteer",
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  });

  await req({
    requester_id: ids.dana,
    title: "בקשה שהוסתרה לדוגמה",
    description: "תוכן שנחסם על ידי מנהל לצורך הדגמת moderation.",
    category: "other",
    payment_type: "volunteer",
    is_hidden: true,
  });

  // 5. Offers (T2 flips open->has_offers automatically on insert)
  const offer = async (fields: Record<string, unknown>) => {
    const { data, error } = await db
      .from("offers")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  };

  await offer({
    request_id: offersReq,
    helper_id: ids.yossi,
    message: "חשמלאי מוסמך, יכול להגיע מחר בבוקר עם ציוד בדיקה.",
    proposed_terms: "₪280 כולל ביקור",
  });
  await offer({
    request_id: offersReq,
    helper_id: ids.amir,
    message: "מתעסק בתיקוני בית, אשמח לנסות לעזור.",
    proposed_terms: "₪200",
  });
  // withdrawn offer example
  const withdrawn = await offer({
    request_id: offersReq,
    helper_id: ids.dana,
    message: "אולי אוכל לעזור בסופ\"ש.",
  });
  await db.from("offers").update({ status: "withdrawn" }).eq("id", withdrawn);

  // assigned request: selected offer + closed competitor
  const selAssigned = await offer({
    request_id: assignedReq,
    helper_id: ids.rina,
    message: "גרה ליד הקופה, אשמח ללוות.",
  });
  const closedComp = await offer({
    request_id: assignedReq,
    helper_id: ids.amir,
    message: "פנוי בבקרים.",
  });
  await db.from("offers").update({ status: "closed" }).eq("id", closedComp);
  await db.from("offers").update({ status: "selected" }).eq("id", selAssigned);
  await db.from("help_requests").update({
    status: "assigned",
    assigned_offer_id: selAssigned,
    assigned_at: new Date().toISOString(),
  }).eq("id", assignedReq);

  // completed request
  const selCompleted = await offer({
    request_id: completedReq,
    helper_id: ids.yossi,
    message: "יש לי טנדר ורצועות, נסגור את זה בשעה.",
    proposed_terms: "₪120",
  });
  await db.from("offers").update({ status: "selected" }).eq("id", selCompleted);
  await db.from("help_requests").update({
    status: "completed",
    assigned_offer_id: selCompleted,
    assigned_at: new Date().toISOString(),
    completed_by_requester: true,
    completed_by_helper: true,
    completed_at: new Date().toISOString(),
  }).eq("id", completedReq);

  // rated request (+ is_paid marker)
  const selRated = await offer({
    request_id: ratedReq,
    helper_id: ids.yossi,
    message: "מתקין מחשבים שנים, כולל אחריות לשבוע :)",
    proposed_terms: "₪100",
  });
  await db.from("offers").update({ status: "selected" }).eq("id", selRated);
  await db.from("help_requests").update({
    status: "rated",
    assigned_offer_id: selRated,
    assigned_at: new Date().toISOString(),
    completed_by_requester: true,
    completed_by_helper: true,
    completed_at: new Date().toISOString(),
    rated_at: new Date().toISOString(),
    is_paid: true,
  }).eq("id", ratedReq);
  await db.from("ratings").insert({
    request_id: ratedReq,
    helper_id: ids.yossi,
    rater_id: ids.rina,
    stars: 5,
    note: "מקצועי, מהיר ואדיב. מומלץ בחום!",
  });

  console.log("seeded. demo password for all users:", PASSWORD);
  console.log("open request:", openReq);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
