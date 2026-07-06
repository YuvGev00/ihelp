/**
 * F1–F7 + X1–X3 + D6: the request lifecycle exercised end-to-end through real
 * RPCs by real users against the local stack (testing spec §3.1, §3.5).
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  stackConfigured,
  newUser,
  makeAdmin,
  verifyIdentity,
  createRequestFixture,
} from "./helpers";

type User = { client: SupabaseClient; id: string; email: string };

describe.skipIf(!stackConfigured)("request lifecycle (integration)", () => {
  let admin: User, requester: User, helperA: User, helperB: User;

  beforeAll(async () => {
    admin = await newUser("admin");
    await makeAdmin(admin.id);
    requester = await newUser("requester");
    helperA = await newUser("helperA");
    helperB = await newUser("helperB");
    await verifyIdentity(requester, admin, "0501111111");
    await verifyIdentity(helperA, admin, "0502222222");
    await verifyIdentity(helperB, admin, "0503333333");
  }, 60_000);

  it("D6: signup trigger created both profile rows", async () => {
    const { data: pub } = await requester.client
      .from("profiles")
      .select("id, is_identity_verified")
      .eq("id", requester.id)
      .single();
    expect(pub?.is_identity_verified).toBe(true); // approved in fixture
    const { data: priv } = await requester.client
      .from("profiles_private")
      .select("user_id, phone")
      .eq("user_id", requester.id)
      .single();
    expect(priv?.phone).toBe("0501111111"); // copied on approval (spec §8.2)
  });

  it("F1→F5: create → offer → assign → dual-complete → rate", async () => {
    // F1: create with photo
    const requestId = await createRequestFixture(requester);
    const { data: created } = await requester.client
      .from("help_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(created?.status).toBe("open");

    // F2: two offers; trigger flips open → has_offers
    const { data: offerA, error: offerAErr } = await helperA.client
      .from("offers")
      .insert({ request_id: requestId, helper_id: helperA.id, message: "אשמח לעזור מחר", pricing_mode: "fixed", price: 100 })
      .select("id")
      .single();
    expect(offerAErr).toBeNull();
    await helperB.client
      .from("offers")
      .insert({ request_id: requestId, helper_id: helperB.id, message: "פנוי כבר היום" });

    const { data: afterOffers } = await requester.client
      .from("help_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(afterOffers?.status).toBe("has_offers");

    // F3: assign A atomically; B's offer closes
    const { error: assignErr } = await requester.client.rpc("assign_offer", {
      p_request_id: requestId,
      p_offer_id: offerA!.id,
    });
    expect(assignErr).toBeNull();

    const { data: assigned } = await requester.client
      .from("help_requests")
      .select("status, assigned_offer_id")
      .eq("id", requestId)
      .single();
    expect(assigned?.status).toBe("assigned");
    expect(assigned?.assigned_offer_id).toBe(offerA!.id);

    const { data: bOffers } = await helperB.client
      .from("offers")
      .select("status")
      .eq("request_id", requestId)
      .eq("helper_id", helperB.id);
    expect(bOffers?.[0]?.status).toBe("closed");

    // Contact reveal works for both parties from `assigned`
    const { data: contact } = await helperA.client.rpc("get_counterpart_contact", {
      p_request_id: requestId,
    });
    expect(contact?.[0]?.phone).toBe("0501111111");

    // F4: dual completion — one side is not enough
    const { error: c1 } = await requester.client.rpc("confirm_completion", {
      p_request_id: requestId,
    });
    expect(c1).toBeNull();
    let { data: mid } = await requester.client
      .from("help_requests")
      .select("status, completed_by_requester, completed_by_helper")
      .eq("id", requestId)
      .single();
    expect(mid?.status).toBe("assigned");
    expect(mid?.completed_by_requester).toBe(true);

    // X2: same side confirming twice stays idempotent
    await requester.client.rpc("confirm_completion", { p_request_id: requestId });
    ({ data: mid } = await requester.client
      .from("help_requests")
      .select("status, completed_by_requester, completed_by_helper")
      .eq("id", requestId)
      .single());
    expect(mid?.status).toBe("assigned");

    const { error: c2 } = await helperA.client.rpc("confirm_completion", {
      p_request_id: requestId,
    });
    expect(c2).toBeNull();
    const { data: done } = await requester.client
      .from("help_requests")
      .select("status, completed_at")
      .eq("id", requestId)
      .single();
    expect(done?.status).toBe("completed");
    expect(done?.completed_at).not.toBeNull();

    // X3: mark_paid works once, then invalid_state
    const { error: paid1 } = await requester.client.rpc("mark_paid", {
      p_request_id: requestId,
    });
    expect(paid1).toBeNull();
    const { error: paid2 } = await requester.client.rpc("mark_paid", {
      p_request_id: requestId,
    });
    expect(paid2?.message).toContain("invalid_state");

    // F5: rating advances to rated; aggregate visible through the view
    const { error: rateErr } = await requester.client.rpc("submit_rating", {
      p_request_id: requestId,
      p_stars: 5,
      p_note: "מצוין",
    });
    expect(rateErr).toBeNull();
    const { data: rated } = await requester.client
      .from("help_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(rated?.status).toBe("rated");

    const { data: viewRows } = await helperB.client
      .from("helper_ratings")
      .select("stars, note")
      .eq("helper_id", helperA.id);
    expect(viewRows?.some((r) => r.stars === 5)).toBe(true);
  }, 60_000);

  it("F7: withdrawing the last active offer returns the request to open", async () => {
    const requestId = await createRequestFixture(requester);
    const { data: offer } = await helperA.client
      .from("offers")
      .insert({ request_id: requestId, helper_id: helperA.id, message: "הצעה זמנית" })
      .select("id")
      .single();

    const { data: withdrawn } = await helperA.client
      .from("offers")
      .update({ status: "withdrawn" })
      .eq("id", offer!.id)
      .select();
    expect(withdrawn?.length).toBe(1);

    const { data: after } = await requester.client
      .from("help_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(after?.status).toBe("open");
  }, 30_000);

  it("X1: assigning a just-withdrawn offer rolls back atomically", async () => {
    const requestId = await createRequestFixture(requester);
    const { data: offerA } = await helperA.client
      .from("offers")
      .insert({ request_id: requestId, helper_id: helperA.id, message: "אציע ואמשוך" })
      .select("id")
      .single();
    await helperB.client
      .from("offers")
      .insert({ request_id: requestId, helper_id: helperB.id, message: "נשאר בפנים" });

    await helperA.client
      .from("offers")
      .update({ status: "withdrawn" })
      .eq("id", offerA!.id);

    const { error } = await requester.client.rpc("assign_offer", {
      p_request_id: requestId,
      p_offer_id: offerA!.id,
    });
    expect(error?.message).toContain("offer_not_active");

    // rollback: the request must still be has_offers (helperB's offer lives)
    const { data: after } = await requester.client
      .from("help_requests")
      .select("status, assigned_offer_id")
      .eq("id", requestId)
      .single();
    expect(after?.status).toBe("has_offers");
    expect(after?.assigned_offer_id).toBeNull();
  }, 30_000);

  it("F6: cancel closes live offers and is terminal", async () => {
    const requestId = await createRequestFixture(requester);
    await helperA.client
      .from("offers")
      .insert({ request_id: requestId, helper_id: helperA.id, message: "הצעה שתיסגר" });

    const { error } = await requester.client.rpc("cancel_request", {
      p_request_id: requestId,
    });
    expect(error).toBeNull();

    const { data: after } = await requester.client
      .from("help_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    expect(after?.status).toBe("cancelled");

    const { data: offers } = await helperA.client
      .from("offers")
      .select("status")
      .eq("request_id", requestId);
    expect(offers?.every((o) => o.status === "closed")).toBe(true);

    // terminal: cancelling again is invalid_state
    const { error: again } = await requester.client.rpc("cancel_request", {
      p_request_id: requestId,
    });
    expect(again?.message).toContain("invalid_state");
  }, 30_000);

  it("X5: admin rejection requires a note", async () => {
    const applicant = await newUser("rejectee");
    const { data: app } = await applicant.client
      .from("verification_applications")
      .insert({
        user_id: applicant.id,
        kind: "identity",
        full_name: "מועמד לדחייה",
        phone: "0509999999",
      })
      .select("id")
      .single();

    const { error: noNote } = await admin.client.rpc("review_application", {
      p_application_id: app!.id,
      p_approve: false,
      p_note: "  ",
    });
    expect(noNote?.message).toContain("note_required");

    const { error: withNote } = await admin.client.rpc("review_application", {
      p_application_id: app!.id,
      p_approve: false,
      p_note: "פרטים חסרים",
    });
    expect(withNote).toBeNull();
  }, 30_000);

  it("F8: after_job offer — helper sets the final price post-completion", async () => {
    const requestId = await createRequestFixture(requester); // paid request
    // helper offers with price decided after the job
    const { data: offer, error: offerErr } = await helperA.client
      .from("offers")
      .insert({
        request_id: requestId,
        helper_id: helperA.id,
        message: "אתמחר אחרי שאראה את הבעיה",
        pricing_mode: "after_job",
      })
      .select("id")
      .single();
    expect(offerErr).toBeNull();

    await requester.client.rpc("assign_offer", {
      p_request_id: requestId,
      p_offer_id: offer!.id,
    });
    // dual completion
    await requester.client.rpc("confirm_completion", { p_request_id: requestId });
    await helperA.client.rpc("confirm_completion", { p_request_id: requestId });

    // requester cannot mark paid yet — no agreed amount exists
    const { error: earlyPaid } = await requester.client.rpc("mark_paid", {
      p_request_id: requestId,
    });
    expect(earlyPaid?.message).toContain("invalid_state");

    // only the selected helper can set the final price
    const { error: strangerPrice } = await helperB.client.rpc("set_final_price", {
      p_request_id: requestId,
      p_price: 999,
    });
    expect(strangerPrice?.message).toContain("not_found");

    const { error: setErr } = await helperA.client.rpc("set_final_price", {
      p_request_id: requestId,
      p_price: 275,
    });
    expect(setErr).toBeNull();

    const { data: priced } = await requester.client
      .from("offers")
      .select("final_price")
      .eq("id", offer!.id)
      .single();
    expect(Number(priced?.final_price)).toBe(275);

    // now the requester can mark paid; setting the price twice is blocked
    const { error: paid } = await requester.client.rpc("mark_paid", {
      p_request_id: requestId,
    });
    expect(paid).toBeNull();
    const { error: twice } = await helperA.client.rpc("set_final_price", {
      p_request_id: requestId,
      p_price: 300,
    });
    expect(twice?.message).toContain("invalid_state");
  }, 60_000);

  it("D9: pricing_mode ⇔ price coupling is CHECK-enforced", async () => {
    const requestId = await createRequestFixture(requester);
    // fixed without a price → CHECK violation
    const fixedNoPrice = await helperA.client.from("offers").insert({
      request_id: requestId,
      helper_id: helperA.id,
      message: "מחיר קבוע בלי סכום",
      pricing_mode: "fixed",
    });
    expect(fixedNoPrice.error).not.toBeNull();
    // volunteer WITH a price → CHECK violation
    const volWithPrice = await helperB.client.from("offers").insert({
      request_id: requestId,
      helper_id: helperB.id,
      message: "התנדבות עם מחיר",
      pricing_mode: "volunteer",
      price: 50,
    });
    expect(volWithPrice.error).not.toBeNull();
  }, 30_000);
});
