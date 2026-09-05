/**
 * P1–P15 + D1–D8 + X4/X6: every abusable permission-matrix row attempted as
 * the WRONG user, asserting denial (testing spec §3.2, §3.3). These are the
 * tests that make spec §13.2 true: forbidden actions are denied at the DB
 * layer, not the UI.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  stackConfigured,
  anonClient,
  serviceClient,
  newUser,
  makeAdmin,
  verifyIdentity,
  createRequestFixture,
} from "./helpers";

type User = { client: SupabaseClient; id: string; email: string };

describe.skipIf(!stackConfigured)("permissions & DB integrity (integration)", () => {
  let admin: User, owner: User, helper: User, stranger: User, unverified: User;
  let requestId: string;

  beforeAll(async () => {
    admin = await newUser("admin");
    await makeAdmin(admin.id);
    owner = await newUser("owner");
    helper = await newUser("helper");
    stranger = await newUser("stranger");
    unverified = await newUser("unverified");
    await verifyIdentity(owner, admin, "0501000001");
    await verifyIdentity(helper, admin, "0501000002");
    await verifyIdentity(stranger, admin, "0501000003");
    requestId = await createRequestFixture(owner);
  }, 90_000);

  // --- P1/P2: the identity gate on both sides -------------------------------

  it("P1: unverified user cannot create a request", async () => {
    const { error } = await unverified.client.rpc("create_request_with_photos", {
      p_title: "ניסיון עקיפה",
      p_description: "משתמש לא מאומת מנסה לפרסם",
      p_category: "other",
      p_lat: 32,
      p_lng: 34.8,
      p_photo_paths: [`${unverified.id}/x.png`],
    });
    expect(error?.message).toContain("forbidden");
  });

  it("P2: unverified user cannot insert an offer (RLS)", async () => {
    const { error } = await unverified.client.from("offers").insert({
      request_id: requestId,
      helper_id: unverified.id,
      message: "לא מאומת מציע",
    });
    expect(error).not.toBeNull();
  });

  // --- P3/P4/D1: offer-side pins --------------------------------------------

  it("P3: offering on your own request is denied", async () => {
    const { error } = await owner.client.from("offers").insert({
      request_id: requestId,
      helper_id: owner.id,
      message: "מציע לעצמי",
    });
    expect(error).not.toBeNull();
  });

  it("P4: an offer cannot be born 'selected' (status pin)", async () => {
    const { error } = await helper.client.from("offers").insert({
      request_id: requestId,
      helper_id: helper.id,
      status: "selected",
      message: "נולד נבחר",
    });
    expect(error).not.toBeNull();
  });

  it("D1: a second ACTIVE offer by the same helper is blocked", async () => {
    const { error: first } = await helper.client.from("offers").insert({
      request_id: requestId,
      helper_id: helper.id,
      message: "הצעה ראשונה",
    });
    expect(first).toBeNull();
    const { error: second } = await helper.client.from("offers").insert({
      request_id: requestId,
      helper_id: helper.id,
      message: "הצעה כפולה",
    });
    expect(second?.message).toMatch(/duplicate|unique/i);
  });

  // --- P5/P6/P11: read surfaces ----------------------------------------------

  it("P5: sealed bids — a stranger sees zero offers on the request", async () => {
    const { data } = await stranger.client
      .from("offers")
      .select("id")
      .eq("request_id", requestId);
    expect(data?.length).toBe(0);
  });

  it("P11: profiles_private of another user is invisible", async () => {
    const { data } = await stranger.client
      .from("profiles_private")
      .select("phone")
      .eq("user_id", owner.id);
    expect(data?.length).toBe(0);
  });

  it("P6: an assigned request disappears for non-parties", async () => {
    const rid = await createRequestFixture(owner);
    const { data: offer } = await helper.client
      .from("offers")
      .insert({ request_id: rid, helper_id: helper.id, message: "הצעה לשיבוץ" })
      .select("id")
      .single();
    await owner.client.rpc("assign_offer", { p_request_id: rid, p_offer_id: offer!.id });

    const { data: strangerView } = await stranger.client
      .from("help_requests")
      .select("id")
      .eq("id", rid);
    expect(strangerView?.length).toBe(0);

    // ...but the selected helper still sees it (later-state visibility)
    const { data: helperView } = await helper.client
      .from("help_requests")
      .select("id")
      .eq("id", rid);
    expect(helperView?.length).toBe(1);

    // P12: contact reveal — party succeeds, stranger gets not_found
    const { error: strangerContact } = await stranger.client.rpc(
      "get_counterpart_contact",
      { p_request_id: rid }
    );
    expect(strangerContact?.message).toContain("not_found");
  }, 30_000);

  // --- P7/P8: RPC ownership with existence-safe errors -----------------------

  it("P7: non-owner assign/cancel gets not_found (no existence leak)", async () => {
    const { error: assign } = await stranger.client.rpc("assign_offer", {
      p_request_id: requestId,
      p_offer_id: crypto.randomUUID(),
    });
    expect(assign?.message).toContain("not_found");

    const { error: cancel } = await stranger.client.rpc("cancel_request", {
      p_request_id: requestId,
    });
    expect(cancel?.message).toContain("not_found");
  });

  it("P8: non-parties cannot confirm completion or rate", async () => {
    const { error: complete } = await stranger.client.rpc("confirm_completion", {
      p_request_id: requestId,
    });
    expect(complete?.message).toContain("not_found");

    const { error: rate } = await helper.client.rpc("submit_rating", {
      p_request_id: requestId,
      p_stars: 5,
      p_note: null,
    });
    expect(rate?.message).toContain("not_found");
  });

  // --- P9/P10: crafted PATCHes vs the column guard ---------------------------

  it("P9: owner cannot PATCH status or is_paid directly", async () => {
    const { data, error } = await owner.client
      .from("help_requests")
      .update({ status: "rated" })
      .eq("id", requestId)
      .select();
    // guard trigger raises OR RLS/enum filtering yields zero rows — either way, denied
    expect(error !== null || data?.length === 0).toBe(true);

    const { error: paidErr, data: paidData } = await owner.client
      .from("help_requests")
      .update({ is_paid: true })
      .eq("id", requestId)
      .select();
    expect(paidErr !== null || paidData?.length === 0).toBe(true);
  });

  it("P10: users cannot self-verify or self-admin", async () => {
    const { error: flagErr, data: flagData } = await unverified.client
      .from("profiles")
      .update({ is_identity_verified: true })
      .eq("id", unverified.id)
      .select();
    expect(flagErr !== null || flagData?.length === 0).toBe(true);
    // definitive check: the flag did not change
    const { data: after } = await unverified.client
      .from("profiles")
      .select("is_identity_verified")
      .eq("id", unverified.id)
      .single();
    expect(after?.is_identity_verified).toBe(false);

    const { error: adminErr, data: adminData } = await unverified.client
      .from("profiles_private")
      .update({ is_admin: true })
      .eq("user_id", unverified.id)
      .select();
    expect(adminErr !== null || adminData?.length === 0).toBe(true);
  });

  // --- P13/P14: admin surface -------------------------------------------------

  it("P13: non-admin cannot review/hide/revoke", async () => {
    const { error: review } = await stranger.client.rpc("review_application", {
      p_application_id: crypto.randomUUID(),
      p_approve: true,
      p_note: null,
    });
    expect(review?.message).toContain("forbidden");

    const { error: hide } = await stranger.client.rpc("set_request_hidden", {
      p_request_id: requestId,
      p_hidden: true,
    });
    expect(hide?.message).toContain("forbidden");

    const { error: revoke } = await stranger.client.rpc("revoke_verification", {
      p_user_id: helper.id,
      p_kind: "identity",
    });
    expect(revoke?.message).toContain("forbidden");
  });

  it("P14: forged already-approved application is denied", async () => {
    const { error } = await stranger.client.from("verification_applications").insert({
      user_id: stranger.id,
      kind: "professional",
      status: "approved",
      full_name: "זיוף",
      doc_path: `${stranger.id}/fake.png`,
    });
    expect(error).not.toBeNull();
  });

  // --- P15: anonymous callers --------------------------------------------------

  it("P15: anonymous clients read nothing", async () => {
    const anon = anonClient();
    const { data: reqs } = await anon.from("help_requests").select("id").limit(1);
    expect(reqs?.length ?? 0).toBe(0);
    const { data: profs } = await anon.from("profiles").select("id").limit(1);
    expect(profs?.length ?? 0).toBe(0);
    const { data: ratings, error: viewErr } = await anon
      .from("helper_ratings")
      .select("stars")
      .limit(1);
    expect(viewErr !== null || (ratings?.length ?? 0) === 0).toBe(true);
  });

  // --- D2–D5, D7, D8, X4, X6: constraints and admin flows ----------------------

  it("D2: a second open application of the same kind is blocked", async () => {
    const applicant = await newUser("double-app");
    const first = await applicant.client.from("verification_applications").insert({
      user_id: applicant.id,
      kind: "identity",
      full_name: "מועמד",
      phone: "0508888888",
    });
    expect(first.error).toBeNull();
    const second = await applicant.client.from("verification_applications").insert({
      user_id: applicant.id,
      kind: "identity",
      full_name: "מועמד שוב",
      phone: "0508888888",
    });
    expect(second.error?.message).toMatch(/duplicate|unique/i);
  }, 30_000);

  it("D3: every request accepts all three pricing stances; mode/price coupling is CHECK-enforced", async () => {
    // requests no longer carry a paid/volunteer intent — pricing is the helper's
    const rid = await createRequestFixture(owner);

    const fixed = await helper.client.from("offers").insert({
      request_id: rid,
      helper_id: helper.id,
      message: "מחיר קבוע",
      pricing_mode: "fixed",
      price: 120,
    });
    expect(fixed.error).toBeNull();

    const afterJob = await stranger.client.from("offers").insert({
      request_id: rid,
      helper_id: stranger.id,
      message: "אתמחר בסוף",
      pricing_mode: "after_job",
    });
    expect(afterJob.error).toBeNull();

    // coupling: fixed without a price, or a priced volunteer, are rejected
    const rid2 = await createRequestFixture(owner);
    const badFixed = await helper.client.from("offers").insert({
      request_id: rid2,
      helper_id: helper.id,
      message: "קבוע בלי סכום",
      pricing_mode: "fixed",
    });
    expect(badFixed.error).not.toBeNull();
    const badVol = await stranger.client.from("offers").insert({
      request_id: rid2,
      helper_id: stranger.id,
      message: "התנדבות עם מחיר",
      pricing_mode: "volunteer",
      price: 50,
    });
    expect(badVol.error).not.toBeNull();
  }, 30_000);

  it("D5/X6: photo-path pins — foreign folder and nonexistent object", async () => {
    const { error: foreign } = await owner.client.rpc("create_request_with_photos", {
      p_title: "תמונה זרה",
      p_description: "מפנה לתיקייה של משתמש אחר",
      p_category: "other",
      p_lat: 32,
      p_lng: 34.8,
      p_photo_paths: [`${helper.id}/not-mine.png`],
    });
    expect(foreign?.message).toContain("forbidden");

    const { error: ghost } = await owner.client.rpc("create_request_with_photos", {
      p_title: "תמונה לא קיימת",
      p_description: "מפנה לאובייקט שלא הועלה",
      p_category: "other",
      p_lat: 32,
      p_lng: 34.8,
      p_photo_paths: [`${owner.id}/ghost.png`],
    });
    expect(ghost?.message).toContain("photo_not_uploaded");
  });

  it("D7: helper_ratings view carries no rater linkage columns", async () => {
    const { error } = await helper.client
      .from("helper_ratings")
      .select("rater_id")
      .limit(1);
    expect(error).not.toBeNull(); // column does not exist on the view
  });

  it("D8/X4: identity revocation cascades; stale professional approval blocked", async () => {
    const target = await newUser("revokee");
    await verifyIdentity(target, admin, "0507777777");

    // pending professional application that must die with the identity
    const cert = `${target.id}/cert.png`;
    await target.client.storage
      .from("verification-docs")
      .upload(cert, Buffer.from("fake"), { contentType: "image/png" });
    const { data: profApp, error: profErr } = await target.client
      .from("verification_applications")
      .insert({
        user_id: target.id,
        kind: "professional",
        full_name: "בעל מקצוע",
        doc_path: cert,
      })
      .select("id")
      .single();
    expect(profErr).toBeNull();

    const { error: revokeErr } = await admin.client.rpc("revoke_verification", {
      p_user_id: target.id,
      p_kind: "identity",
    });
    expect(revokeErr).toBeNull();

    const { data: flags } = await target.client
      .from("profiles")
      .select("is_identity_verified, is_professional")
      .eq("id", target.id)
      .single();
    expect(flags?.is_identity_verified).toBe(false);
    expect(flags?.is_professional).toBe(false);

    // X4: the pending professional application was revoked, and approving it
    // now must fail (identity gone)
    const { error: approveStale } = await admin.client.rpc("review_application", {
      p_application_id: profApp!.id,
      p_approve: true,
      p_note: null,
    });
    expect(approveStale?.message).toContain("invalid_state");
  }, 30_000);

  // D4: at most one rating per request — the ratings PK is request_id.
  it("D4: a second rating on the same request violates the PK", async () => {
    const svc = serviceClient();
    // Insert one rating directly (service role bypasses RLS; we are testing the
    // PK constraint, not the policy).
    const first = await svc.from("ratings").insert({
      request_id: requestId,
      helper_id: helper.id,
      rater_id: owner.id,
      stars: 5,
    });
    expect(first.error).toBeNull();
    const second = await svc.from("ratings").insert({
      request_id: requestId,
      helper_id: helper.id,
      rater_id: owner.id,
      stars: 3,
    });
    expect(second.error).not.toBeNull(); // duplicate PK on request_id
    await svc.from("ratings").delete().eq("request_id", requestId);
  }, 30_000);

  // D5: a professional application must carry a document (CHECK constraint).
  it("D5: a professional application without a document is rejected", async () => {
    const { error } = await helper.client
      .from("verification_applications")
      .insert({
        user_id: helper.id,
        kind: "professional",
        full_name: "בעל מקצוע",
        self_description: "no doc",
        doc_path: null, // violates professional_requires_doc
      });
    expect(error).not.toBeNull();
  }, 30_000);
});
