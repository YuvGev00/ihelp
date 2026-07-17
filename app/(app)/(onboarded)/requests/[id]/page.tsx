import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/categories";
import {
  StatusChip,
  PublicStatusChip,
  HiddenChip,
  Badge,
  Stars,
  Avatar,
  EmptyState,
  OfferPriceChip,
  formatDate,
} from "@/components/ui";
import { OfferForm } from "@/components/OfferForm";
import { EditRequestForm } from "@/components/RequestForm";
import { MapView } from "@/components/MapView";
import {
  AssignButton,
  CancelRequestButton,
  ConfirmCompletionButton,
  MarkPaidButton,
  RatingForm,
  SetFinalPriceForm,
} from "@/components/LifecycleActions";
import { S } from "@/lib/strings";

/**
 * The request detail adapts to the viewer (spec §11 UX): same URL, panels per
 * role. RLS decides row visibility — an invisible row is a 404, deliberately
 * indistinguishable from a missing one.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: request } = await supabase
    .from("help_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (!request) notFound(); // missing OR RLS-invisible — same thing

  const isOwner = request.requester_id === user.id;

  const [{ data: photos }, { data: offers }, { data: profile }, { data: rating }] =
    await Promise.all([
      supabase
        .from("request_photos")
        .select("storage_path, position")
        .eq("request_id", id)
        .order("position"),
      // Sealed bids: RLS returns all offers to the owner, own offer to a helper.
      supabase
        .from("offers")
        .select("id, helper_id, status, message, pricing_mode, price, final_price, created_at")
        .eq("request_id", id)
        .order("created_at"),
      supabase
        .from("profiles")
        .select("is_identity_verified")
        .eq("id", user.id)
        .single(),
      supabase.from("ratings").select("stars, note").eq("request_id", id).maybeSingle(),
    ]);

  // Photos via bulk signed URLs (private bucket).
  const photoPaths = (photos ?? []).map((p) => p.storage_path);
  const signed = photoPaths.length
    ? (
        await supabase.storage
          .from("request-photos")
          .createSignedUrls(photoPaths, 3600)
      ).data
    : [];

  // Helper public profiles + rating aggregates for visible offers.
  const helperIds = [...new Set((offers ?? []).map((o) => o.helper_id))];
  const [{ data: helperProfiles }, { data: helperRatings }] = helperIds.length
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("id, display_name, avatar_path, is_identity_verified, is_professional")
          .in("id", helperIds),
        supabase.from("helper_ratings").select("helper_id, stars").in("helper_id", helperIds),
      ])
    : [{ data: [] }, { data: [] }];
  const profileById = new Map((helperProfiles ?? []).map((p) => [p.id, p]));
  const ratingAgg = new Map<string, { sum: number; count: number }>();
  for (const r of helperRatings ?? []) {
    const agg = ratingAgg.get(r.helper_id) ?? { sum: 0, count: 0 };
    agg.sum += r.stars;
    agg.count += 1;
    ratingAgg.set(r.helper_id, agg);
  }

  // Prefer the ACTIVE offer (withdraw-then-reoffer leaves older rows behind);
  // fall back to the newest one so the status footer reflects reality.
  const myOffers = (offers ?? []).filter((o) => o.helper_id === user.id);
  const myOffer =
    myOffers.find((o) => o.status === "active") ??
    myOffers[myOffers.length - 1] ??
    null;
  const selectedOffer =
    (offers ?? []).find((o) => o.id === request.assigned_offer_id) ?? null;
  const isSelectedHelper = selectedOffer?.helper_id === user.id;
  const isParty = isOwner || isSelectedHelper;
  const assignedPlus = ["assigned", "completed", "rated"].includes(request.status);

  // Contact reveal — the only read RPC; parties only, assigned onward.
  const contact =
    isParty && assignedPlus
      ? (await supabase.rpc("get_counterpart_contact", { p_request_id: id })).data?.[0]
      : null;

  // Counterpart avatar for the contact card: the helper's if the viewer is the
  // owner, else the requester's. Public profiles.avatar_path (RLS-readable).
  const counterpartId = contact
    ? isOwner
      ? selectedOffer?.helper_id
      : request.requester_id
    : null;
  const contactAvatarPath = counterpartId
    ? (
        await supabase
          .from("profiles")
          .select("avatar_path")
          .eq("id", counterpartId)
          .single()
      ).data?.avatar_path ?? null
    : null;

  const canOffer =
    !isOwner &&
    ["open", "has_offers"].includes(request.status) &&
    (profile?.is_identity_verified ?? false);

  const editable = isOwner && ["open", "has_offers"].includes(request.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header — the owner/admin see the true status; a browsing helper sees
          the public one (has_offers → "open", so offer counts stay private). */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {isOwner ? (
            <StatusChip status={request.status} />
          ) : (
            <PublicStatusChip status={request.status} />
          )}
          <span className="chip bg-[#f2f5f4] text-body">
            {categoryLabel(request.category)}
          </span>
          {request.is_hidden && <HiddenChip />}
          {request.is_paid && (
            <span className="chip bg-mint text-brand">
              {S.lifecycle.markedPaid}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-extrabold text-ink">{request.title}</h1>
        <p className="text-xs text-muted">
          {S.requests.postedAt} {formatDate(request.created_at)}
        </p>
      </div>

      {/* Photos — fixed-aspect boxes so any image dimensions render cleanly */}
      {signed && signed.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {signed.map((s) =>
            s.signedUrl ? (
              <div
                key={s.path}
                className="aspect-video h-48 shrink-0 overflow-hidden rounded-2xl bg-[#e5efeb]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.signedUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null
          )}
        </div>
      )}

      <p className="whitespace-pre-wrap leading-relaxed text-body">
        {request.description}
      </p>

      {/* Location — display-only OpenStreetMap; the distance chip elsewhere is
          the dependency-free source of truth, so the map is purely additive. */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-[#35433d]">
          {S.requests.mapTitle}
        </h2>
        <MapView lat={request.lat} lng={request.lng} />
      </section>

      {/* Owner tools while editable */}
      {editable && (
        <>
          <EditRequestForm
            requestId={id}
            defaults={{
              title: request.title,
              description: request.description,
              category: request.category,
            }}
          />
          <CancelRequestButton requestId={id} />
        </>
      )}

      {/* Contact card — parties only, post-assignment (spec §8.4) */}
      {contact && (
        <section className="card border-mint-border bg-mint">
          <h2 className="font-extrabold text-ink">{S.lifecycle.contactTitle}</h2>
          <p className="mb-3 text-xs text-muted">{S.lifecycle.contactExplainer}</p>
          <div className="flex items-center gap-3">
            <Avatar
              name={contact.display_name}
              path={contactAvatarPath}
              size={44}
            />
            <div className="flex-1">
              <p className="font-bold text-ink">{contact.display_name}</p>
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  dir="ltr"
                  className="block text-start text-brand font-bold"
                >
                  {contact.phone}
                </a>
              )}
            </div>
          </div>
          {selectedOffer && (
            <div className="mt-3 flex items-center justify-between border-t border-mint-border pt-3">
              <span className="text-sm font-semibold text-[#3f7d68]">
                {S.lifecycle.agreedPrice}
              </span>
              <OfferPriceChip offer={selectedOffer} />
            </div>
          )}
        </section>
      )}

      {/* Completion panel — assigned, parties (spec §8.4 dual confirmation) */}
      {isParty && request.status === "assigned" && (
        <section className="card space-y-2">
          <h2 className="font-extrabold text-ink">{S.lifecycle.confirmCompletion}</h2>
          {(() => {
            const mine = isOwner
              ? request.completed_by_requester
              : request.completed_by_helper;
            const theirs = isOwner
              ? request.completed_by_helper
              : request.completed_by_requester;
            if (mine)
              return (
                <p className="text-sm text-body">
                  {S.lifecycle.youConfirmed} — {S.lifecycle.waitingOther}
                </p>
              );
            if (theirs)
              return (
                <p className="text-sm font-semibold text-brand">
                  {S.lifecycle.otherConfirmed}
                </p>
              );
            return null;
          })()}
          {((isOwner && !request.completed_by_requester) ||
            (isSelectedHelper && !request.completed_by_helper)) && (
            <ConfirmCompletionButton requestId={id} />
          )}
          {isOwner && <CancelRequestButton requestId={id} />}
        </section>
      )}

      {/* Post-completion: after-job pricing, rating (owner), paid marker */}
      {isParty && ["completed", "rated"].includes(request.status) && (
        <section className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-mint-border bg-mint p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-xl text-white">
              ✓
            </span>
            <div>
              <p className="font-extrabold text-pine">{S.lifecycle.completedBoth}</p>
            </div>
          </div>
          {/* after_job: the helper prices now; the requester waits */}
          {(() => {
            const pendingFinal =
              selectedOffer?.pricing_mode === "after_job" &&
              selectedOffer.final_price == null;
            if (!pendingFinal) return null;
            return isSelectedHelper ? (
              <SetFinalPriceForm requestId={id} />
            ) : (
              <p className="rounded-2xl border border-[#f5e6bf] bg-[#fff8e6] p-3 text-sm text-[#a16207]">
                {S.offers.awaitingFinalPrice}
              </p>
            );
          })()}
          {/* mark paid unlocks once an agreed amount exists (fixed or final) */}
          {isOwner &&
            selectedOffer &&
            (selectedOffer.price != null || selectedOffer.final_price != null) &&
            !request.is_paid && <MarkPaidButton requestId={id} />}
          {isOwner && request.status === "completed" && <RatingForm requestId={id} />}
          {rating && (
            <div className="card">
              <h2 className="mb-1 font-extrabold text-ink">{S.lifecycle.rateTitle}</h2>
              <Stars value={rating.stars} />
              {rating.note && <p className="mt-1 text-sm text-body">{rating.note}</p>}
            </div>
          )}
        </section>
      )}

      {/* Offers section — the requester only compares LIVE offers. A helper who
          withdrew (or whose offer was auto-closed on assignment) no longer
          appears here; the offer stays visible only to its own owner. */}
      {isOwner ? (
        (() => {
          const liveOffers = (offers ?? []).filter((o) =>
            ["active", "selected"].includes(o.status)
          );
          return (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-ink">{S.offers.sectionTitle}</h2>
            {liveOffers.length > 0 && (
              <span className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-bold text-brand">
                {S.offers.offerCount(liveOffers.length)}
              </span>
            )}
          </div>
          {!liveOffers.length ? (
            <EmptyState
              message={
                ["open", "has_offers"].includes(request.status) &&
                !request.is_hidden
                  ? S.offers.noOffersYet
                  : S.offers.noOffersFinal
              }
            />
          ) : (
            <ul className="space-y-3">
              {liveOffers.map((o) => {
                const hp = profileById.get(o.helper_id);
                const agg = ratingAgg.get(o.helper_id);
                // The selected offer stands out; while choosing, so does the
                // first live offer (the redesign's "recommended" emphasis).
                const highlight =
                  o.status === "selected" ||
                  (request.status === "has_offers" && o.id === liveOffers[0].id);
                return (
                  <li
                    key={o.id}
                    className={`rounded-2xl border bg-white p-4 space-y-3 ${
                      highlight
                        ? "border-2 border-brand shadow-[var(--shadow-raise)]"
                        : "border-line shadow-[var(--shadow-card)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={hp?.display_name ?? "?"} path={hp?.avatar_path} size={44} />
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/helpers/${o.helper_id}`}
                          className="font-bold text-ink hover:underline"
                        >
                          {hp?.display_name}
                        </Link>
                        <div className="mt-0.5">
                          <Stars
                            value={agg ? agg.sum / agg.count : null}
                            count={agg?.count ?? 0}
                          />
                        </div>
                      </div>
                      <OfferPriceChip offer={o} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        verified={hp?.is_identity_verified}
                        professional={hp?.is_professional}
                      />
                      {o.status === "selected" && (
                        <span className="chip bg-mint text-brand">
                          {S.offers.status.selected}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-body">{o.message}</p>
                    {request.status === "has_offers" && o.status === "active" && (
                      <AssignButton requestId={id} offerId={o.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
          );
        })()
      ) : canOffer ? (
        <OfferForm
          requestId={id}
          existing={
            myOffer?.status === "active"
              ? {
                  id: myOffer.id,
                  message: myOffer.message,
                  price: myOffer.price,
                  pricingMode: myOffer.pricing_mode,
                }
              : undefined
          }
        />
      ) : !isOwner && !profile?.is_identity_verified &&
        ["open", "has_offers"].includes(request.status) ? (
        <section className="card text-center">
          <p className="mb-3 text-sm text-body">{S.verification.gateMessage}</p>
          <Link href="/verification" className="btn-primary">
            {S.nav.verification}
          </Link>
        </section>
      ) : null}

      {/* Helper's own offer status after selection/closure — but not for a
          withdrawn offer (the helper took it back; re-offering is available). */}
      {myOffer &&
        !["active", "withdrawn"].includes(myOffer.status) && (
          <p className="text-sm text-muted">
            {S.offers.yourOffer}: {S.offers.status[myOffer.status]}
          </p>
        )}
    </div>
  );
}
