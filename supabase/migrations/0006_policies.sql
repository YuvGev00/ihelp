-- iHelp: Row Level Security (design doc 03 §2).
-- RLS enabled on all seven tables; no policy targets anon. There is
-- deliberately NO INSERT policy on help_requests, request_photos, ratings:
-- those inserts happen only inside SECURITY DEFINER RPCs, which is what makes
-- their invariants (>=1 photo, atomic status flips) unskippable.

alter table public.profiles                  enable row level security;
alter table public.profiles_private         enable row level security;
alter table public.verification_applications enable row level security;
alter table public.help_requests             enable row level security;
alter table public.offers                    enable row level security;
alter table public.request_photos            enable row level security;
alter table public.ratings                   enable row level security;

-- profiles: public row — names + badges shown wherever a helper appears.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- profiles_private: own-row only. Phone/home coords never ride the public row;
-- the contact RPC and is_admin() are the sole cross-user paths in.
create policy private_select_own on public.profiles_private
  for select to authenticated using (user_id = auth.uid());
create policy private_update_own on public.profiles_private
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- verification_applications: applicant sees own history; admins see the queue.
-- INSERT pins status/decided_* so "decisions go through review_application
-- only" is true by construction, and pins doc_path to the caller's own folder.
create policy applications_select on public.verification_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy applications_insert on public.verification_applications
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (kind = 'identity' or public.is_identity_verified())
    and status = 'pending'
    and admin_note is null and decided_by is null and decided_at is null
    and (doc_path is null or doc_path like auth.uid()::text || '/%')
  );

-- help_requests: the spec 9.2 view rule verbatim. Selected-helper check goes
-- through the definer helper to avoid policy recursion with offers.
create policy requests_select on public.help_requests
  for select to authenticated
  using (
    (status in ('open','has_offers') and not is_hidden)
    or requester_id = auth.uid()
    or public.is_admin()
    or public.is_selected_helper(assigned_offer_id)
  );
-- Deliberately the ONLY update policy on this table: permissive policies OR
-- their USING and WITH CHECK clauses independently, so a second "mark paid"
-- policy would reopen content edits on finished jobs. mark_paid is an RPC.
create policy requests_update_own on public.help_requests
  for update to authenticated
  using (requester_id = auth.uid() and status in ('open','has_offers'))
  with check (requester_id = auth.uid());

-- offers: sealed-bid visibility — offer owner + request owner, nobody else.
create policy offers_select on public.offers
  for select to authenticated
  using (
    helper_id = auth.uid()
    or exists (select 1 from public.help_requests r
               where r.id = request_id and r.requester_id = auth.uid())
  );
-- status='active' pins birth state: without it a crafted insert creates an
-- offer born 'selected' (spoofing the comparison view) or born 'closed'
-- (evading the one-active partial unique index).
create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    helper_id = auth.uid()
    and status = 'active'
    and public.is_identity_verified()
    and exists (select 1 from public.help_requests r
                where r.id = request_id
                  and r.requester_id <> auth.uid()
                  and r.status in ('open','has_offers')
                  and not r.is_hidden)
  );
-- Edit or withdraw while active. The CHECK's closed set stops a helper
-- PATCHing their own offer to 'selected'; request_id/helper_id/request_title/
-- created_at are column-guard-protected against re-pointing.
create policy offers_update_own on public.offers
  for update to authenticated
  using (helper_id = auth.uid() and status = 'active')
  with check (helper_id = auth.uid() and status in ('active','withdrawn'));

-- request_photos: mirrors the parent request's visibility automatically — the
-- subquery is itself RLS-filtered per caller.
create policy photos_select on public.request_photos
  for select to authenticated
  using (exists (select 1 from public.help_requests r where r.id = request_id));

-- ratings: base table is party-scoped (it carries rater/request linkage);
-- third parties read through the helper_ratings view below.
create policy ratings_select on public.ratings
  for select to authenticated
  using (helper_id = auth.uid() or rater_id = auth.uid() or public.is_admin());

-- The public rating surface (spec 9.2 "View rating | any signed-in user"):
-- stars + note + when, per helper — WITHOUT rater/request linkage. Postgres
-- views execute with the owner's rights by default: the column-slicing tool
-- RLS lacks. Rater identity is deliberately not shown to third parties.
create view public.helper_ratings
  with (security_invoker = false) as
  select helper_id, stars, note, created_at from public.ratings;
grant select on public.helper_ratings to authenticated;
