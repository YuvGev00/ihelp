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

// Never hardcode credentials in the repo: provide SEED_PASSWORD, or a random
// one is generated and printed exactly once at the end of the run.
const PASSWORD =
  process.env.SEED_PASSWORD ??
  `demo-${Math.random().toString(36).slice(2, 10)}`;

/** Throws on supabase-js soft errors ({ error } results do not throw). */
function must<T extends { error: { message: string } | null }>(
  result: T,
  what: string
): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result;
}

import { deflateSync } from "node:zlib";

// A real placeholder image beats a 1x1 stretch: build a proper wide PNG with a
// soft diagonal two-tone gradient so demo feed cards look like a live
// marketplace. Zero dependencies — a minimal hand-rolled PNG encoder.
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function gradientPng(from: [number, number, number], to: [number, number, number]): Buffer {
  const W = 320, H = 200;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2; // diagonal blend
      raw[p++] = Math.round(from[0] + (to[0] - from[0]) * t);
      raw[p++] = Math.round(from[1] + (to[1] - from[1]) * t);
      raw[p++] = Math.round(from[2] + (to[2] - from[2]) * t);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// A calm palette per category so cards are distinguishable at a glance.
const CATEGORY_GRADIENTS: Record<string, [[number, number, number], [number, number, number]]> = {
  repairs:     [[214, 240, 229], [140, 200, 170]],
  electricity: [[253, 240, 210], [240, 200, 120]],
  plumbing:    [[214, 235, 245], [130, 190, 225]],
  moving:      [[235, 228, 245], [180, 160, 220]],
  tutoring:    [[245, 224, 224], [225, 150, 150]],
  tech_help:   [[220, 235, 240], [140, 190, 205]],
  errands:     [[224, 240, 224], [150, 205, 150]],
  gardening:   [[224, 240, 214], [150, 200, 120]],
  pets:        [[245, 235, 214], [225, 195, 140]],
  other:       [[232, 232, 232], [180, 180, 190]],
};
function categoryImage(category: string): Buffer {
  const [from, to] = CATEGORY_GRADIENTS[category] ?? CATEGORY_GRADIENTS.other;
  return gradientPng(from, to);
}
// Small neutral image for verification documents.
const DOC_PNG = gradientPng([230, 230, 235], [200, 200, 210]);

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
    must(
      await db.from("verification_applications").insert({
        user_id: ids[u.key],
        kind: "identity",
        status: "approved",
        full_name: u.name,
        self_description: "משתמש/ת דמו",
        phone: u.phone ?? "0500000000",
        decided_by: ids.admin,
        decided_at: new Date().toISOString(),
      }),
      `identity application (${u.key})`
    );
  }
  // professional_requires_doc CHECK: the certificate object must exist
  const certPath = `${ids.yossi}/seed-certificate.png`;
  must(
    await db.storage
      .from("verification-docs")
      .upload(certPath, DOC_PNG, {
        contentType: "image/png",
        upsert: true,
      }),
    "certificate upload"
  );
  must(
    await db.from("verification_applications").insert({
      user_id: ids.yossi,
      kind: "professional",
      status: "approved",
      full_name: "יוסי כהן",
      self_description: "חשמלאי מוסמך, 12 שנות ניסיון",
      doc_path: certPath,
      decided_by: ids.admin,
      decided_at: new Date().toISOString(),
    }),
    "professional application"
  );
  // one pending identity application for the admin queue demo
  must(
    await db.from("verification_applications").insert({
      user_id: ids.noa,
      kind: "identity",
      status: "pending",
      full_name: "נועה פרידמן",
      self_description: "שמחה לעזור לשכנים באזור",
      phone: "0500000006",
    }),
    "pending application"
  );

  // 4. Requests across the lifecycle. Seed inserts set states directly
  // (service role passes the column guard). Every request gets a placeholder
  // photo — the demo must respect the ">=1 photo" invariant the RPC enforces
  // for real users. Each request is spread around central Tel Aviv so the map
  // and the distance sorting show a realistic range (not one cluster).
  let photoSeq = 0;
  const spread = () => ({
    lat: GEO.lat + (Math.random() - 0.5) * 0.06, // ~±3 km
    lng: GEO.lng + (Math.random() - 0.5) * 0.06,
  });
  const req = async (fields: Record<string, unknown> & { requester_id: string }) => {
    const { data, error } = await db
      .from("help_requests")
      .insert({ ...spread(), ...fields })
      .select("id")
      .single();
    if (error) throw error;
    const path = `${fields.requester_id}/seed-photo-${photoSeq++}.png`;
    must(
      await db.storage
        .from("request-photos")
        .upload(path, categoryImage(String(fields.category)), {
          contentType: "image/png",
          upsert: true,
        }),
      `photo upload (${path})`
    );
    must(
      await db
        .from("request_photos")
        .insert({ request_id: data.id, storage_path: path, position: 0 }),
      `photo row (${path})`
    );
    return data.id as string;
  };

  const openReq = await req({
    requester_id: ids.dana,
    title: "עזרה בהרכבת ארון",
    description: "ארון איקאה שהגיע בקרטונים, צריך שעתיים של עבודה משותפת.",
    category: "repairs",
  });

  const offersReq = await req({
    requester_id: ids.rina,
    title: "תיקון דוד חשמל",
    description: "הדוד מפסיק לחמם. דרוש חשמלאי מוסמך לבדיקה.",
    category: "electricity",
  });

  const assignedReq = await req({
    requester_id: ids.dana,
    title: "ליווי לקופת חולים",
    description: "סבתא שלי צריכה ליווי לתור בבוקר, כשעה וחצי.",
    category: "errands",
  });

  const completedReq = await req({
    requester_id: ids.amir,
    title: "עזרה בהעברת ספה",
    description: "להוריד ספה שלוש קומות ולהעמיס על טנדר.",
    category: "moving",
  });

  const ratedReq = await req({
    requester_id: ids.rina,
    title: "התקנת מדפסת ומחשב",
    description: "מחשב חדש שצריך להעביר אליו הכל ולהתקין מדפסת.",
    category: "tech_help",
  });

  await req({
    requester_id: ids.amir,
    title: "השקיית גינה בחופשה",
    description: "שבוע בחו\"ל, צריך השקיה פעמיים.",
    category: "gardening",
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
  });

  await req({
    requester_id: ids.dana,
    title: "בקשה שהוסתרה לדוגמה",
    description: "תוכן שנחסם על ידי מנהל לצורך הדגמת moderation.",
    category: "other",
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
    pricing_mode: "fixed",
    price: 280,
  });
  await offer({
    request_id: offersReq,
    helper_id: ids.amir,
    message: "מתעסק בתיקוני בית, אשמח לנסות לעזור.",
    pricing_mode: "after_job",
    price: null,
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
    pricing_mode: "fixed",
    price: 120,
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
    pricing_mode: "fixed",
    price: 100,
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
  must(
    await db.from("ratings").insert({
      request_id: ratedReq,
      helper_id: ids.yossi,
      rater_id: ids.rina,
      stars: 5,
      note: "מקצועי, מהיר ואדיב. מומלץ בחום!",
    }),
    "rating 1"
  );

  // A second rated job so helper averages are non-trivial (yossi: 5 + 4).
  const ratedReq2 = await req({
    requester_id: ids.dana,
    title: "החלפת שקע שרוף",
    description: "שקע במטבח הפסיק לעבוד ומריח שרוף — צריך החלפה.",
    category: "electricity",
  });
  const selRated2 = await offer({
    request_id: ratedReq2,
    helper_id: ids.yossi,
    message: "מגיע עם שקע חדש, עבודה של חצי שעה.",
    pricing_mode: "fixed",
    price: 150,
  });
  await db.from("offers").update({ status: "selected" }).eq("id", selRated2);
  await db.from("help_requests").update({
    status: "rated",
    assigned_offer_id: selRated2,
    assigned_at: new Date().toISOString(),
    completed_by_requester: true,
    completed_by_helper: true,
    completed_at: new Date().toISOString(),
    rated_at: new Date().toISOString(),
    is_paid: true,
  }).eq("id", ratedReq2);
  must(
    await db.from("ratings").insert({
      request_id: ratedReq2,
      helper_id: ids.yossi,
      rater_id: ids.dana,
      stars: 4,
      note: "עבודה טובה, איחר קצת.",
    }),
    "rating 2"
  );

  console.log("seeded. demo password for all users:", PASSWORD);
  console.log("open request:", openReq);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
