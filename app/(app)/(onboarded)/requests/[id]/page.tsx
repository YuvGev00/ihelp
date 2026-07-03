import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/categories";
import {
  StatusChip,
  PaymentChip,
  Badge,
  Stars,
  EmptyState,
  formatDate,
} from "@/components/ui";
import { OfferForm } from "@/components/OfferForm";
import { EditRequestForm } from "@/components/RequestForm";
import {
  AssignButton,
  CancelRequestButton,
  ConfirmCompletionButton,
  MarkPaidButton,
  RatingForm,
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
        .select("id, helper_id, status, message, price, created_at")
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
          .select("id, display_name, is_identity_verified, is_professional")
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

  const canOffer =
    !isOwner &&
    ["open", "has_offers"].includes(request.status) &&
    (profile?.is_identity_verified ?? false);

  const editable = isOwner && ["open", "has_offers"].includes(request.status);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <StatusChip status={request.status} />
          <PaymentChip paymentType={request.payment_type} amount={null} />
          <span className="chip bg-stone-100 text-stone-600">
            {categoryLabel(request.category)}
          </span>
          {request.is_hidden && (
            <span className="chip bg-stone-800 text-white">{S.requests.hidden}</span>
          )}
          {request.is_paid && (
            <span className="chip bg-emerald-100 text-emerald-800">
              {S.lifecycle.markedPaid}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold">{request.title}</h1>
        <p className="text-xs text-stone-400">
          {S.requests.postedAt} {formatDate(request.created_at)}
        </p>
      </div>

      {/* Photos */}
      {signed && signed.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {signed.map((s) =>
            s.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={s.path}
                src={s.signedUrl}
                alt=""
                className="h-48 rounded-xl object-cover"
              />
            ) : null
          )}
        </div>
      )}

      <p className="whitespace-pre-wrap text-stone-700">{request.description}</p>

      {/* Owner tools while editable */}
      {editable && (
        <>
          <EditRequestForm
            requestId={id}
            defaults={{
              title: request.title,
              description: request.description,
              category: request.category,
              paymentType: request.payment_type,
            }}
          />
          <CancelRequestButton requestId={id} />
        </>
      )}

      {/* Contact card — parties only, post-assignment (spec §8.4) */}
      {contact && (
        <section className="card border-emerald-300 bg-emerald-50">
          <h2 className="font-semibold">{S.lifecycle.contactTitle}</h2>
          <p className="mb-2 text-xs text-stone-500">{S.lifecycle.contactExplainer}</p>
          <p className="text-lg font-semibold">{contact.display_name}</p>
          {contact.phone && (
            <a href={`tel:${contact.phone}`} dir="ltr" className="text-lg text-emerald-700 underline">
              {contact.phone}
            </a>
          )}
          {selectedOffer && (
            <p className="mt-2 text-sm text-stone-700">
              {S.lifecycle.agreedPrice}:{" "}
              <b>
                {selectedOffer.price != null
                  ? `₪${selectedOffer.price}`
                  : S.offers.freeOffer}
              </b>
            </p>
          )}
        </section>
      )}

      {/* Completion panel — assigned, parties (spec §8.4 dual confirmation) */}
      {isParty && request.status === "assigned" && (
        <section className="card space-y-2">
          <h2 className="font-semibold">{S.lifecycle.confirmCompletion}</h2>
          {(() => {
            const mine = isOwner
              ? request.completed_by_requester
              : request.completed_by_helper;
            const theirs = isOwner
              ? request.completed_by_helper
              : request.completed_by_requester;
            if (mine)
              return (
                <p className="text-sm text-stone-600">
                  {S.lifecycle.youConfirmed} — {S.lifecycle.waitingOther}
                </p>
              );
            if (theirs)
              return (
                <p className="text-sm font-medium text-emerald-700">
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

      {/* Post-completion: rating (owner) + paid marker */}
      {isParty && ["completed", "rated"].includes(request.status) && (
        <section className="space-y-4">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            {S.lifecycle.completedBoth}
          </p>
          {isOwner && selectedOffer?.price != null && !request.is_paid && (
            <MarkPaidButton requestId={id} />
          )}
          {isOwner && request.status === "completed" && <RatingForm requestId={id} />}
          {rating && (
            <div className="card">
              <h2 className="mb-1 font-semibold">{S.lifecycle.rateTitle}</h2>
              <Stars value={rating.stars} />
              {rating.note && <p className="mt-1 text-sm text-stone-600">{rating.note}</p>}
            </div>
          )}
        </section>
      )}

      {/* Offers section */}
      {isOwner ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">{S.offers.sectionTitle}</h2>
          {!offers?.length ? (
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
              {offers.map((o) => {
                const hp = profileById.get(o.helper_id);
                const agg = ratingAgg.get(o.helper_id);
                return (
                  <li key={o.id} className="card space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/helpers/${o.helper_id}`}
                        className="font-semibold hover:underline"
                      >
                        {hp?.display_name}
                      </Link>
                      <Badge
                        verified={hp?.is_identity_verified}
                        professional={hp?.is_professional}
                      />
                      <Stars
                        value={agg ? agg.sum / agg.count : null}
                        count={agg?.count ?? 0}
                      />
                      <span className="ms-auto flex items-center gap-1.5">
                        <span
                          className={`chip ${o.price != null ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"}`}
                        >
                          {o.price != null ? `₪${o.price}` : S.offers.freeOffer}
                        </span>
                        <span className="chip bg-stone-100 text-stone-600">
                          {S.offers.status[o.status]}
                        </span>
                      </span>
                    </div>
                    <p className="text-sm text-stone-700">{o.message}</p>
                    {request.status === "has_offers" && o.status === "active" && (
                      <AssignButton requestId={id} offerId={o.id} />
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : canOffer ? (
        <OfferForm
          requestId={id}
          isPaid={request.payment_type === "paid"}
          existing={
            myOffer?.status === "active"
              ? {
                  id: myOffer.id,
                  message: myOffer.message,
                  price: myOffer.price,
                }
              : undefined
          }
        />
      ) : !isOwner && !profile?.is_identity_verified &&
        ["open", "has_offers"].includes(request.status) ? (
        <section className="card text-center">
          <p className="mb-2 text-sm text-stone-600">{S.verification.gateMessage}</p>
          <Link href="/verification" className="btn-primary">
            {S.nav.verification}
          </Link>
        </section>
      ) : null}

      {/* Helper's own offer status after selection/closure */}
      {myOffer && myOffer.status !== "active" && (
        <p className="text-sm text-stone-500">
          {S.offers.yourOffer}: {S.offers.status[myOffer.status]}
        </p>
      )}
    </div>
  );
}
