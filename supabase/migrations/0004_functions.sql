-- iHelp: database functions — the privileged-code inventory (design doc 03 §3).
-- Conventions: security definer + set search_path = public; execute revoked
-- from public/anon, granted to authenticated; permission checks first.
--
-- Error-ordering rule (no existence leaks): raise 'not_found' whenever the
-- caller could not SELECT the row under the policies, BEFORE any state check;
-- 'invalid_state'/'forbidden' only ever reach callers who can see the row.

-- ---------------------------------------------------------------------------
-- Policy helpers (SECURITY DEFINER lookups used inside policies)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles_private where user_id = auth.uid()),
    false);
$$;

create or replace function public.is_identity_verified() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_identity_verified from public.profiles where id = auth.uid()),
    false);
$$;

-- Breaks the policy recursion cycle between help_requests and offers: their
-- SELECT policies reference each other, which Postgres rejects with
-- "infinite recursion detected in policy". A definer lookup terminates it.
create or replace function public.is_selected_helper(p_assigned_offer_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.offers o
    where o.id = p_assigned_offer_id and o.helper_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- RPCs — the write path for every state transition
-- ---------------------------------------------------------------------------

-- 3.1 Create request + photos atomically; enforce >=1 distinct real photo in
-- the caller's own folder. There is deliberately no INSERT policy on
-- help_requests/request_photos: this RPC is the only way in.
create or replace function public.create_request_with_photos(
  p_title text, p_description text, p_category text,
  p_payment_type public.payment_type, p_amount numeric,
  p_lat double precision, p_lng double precision,
  p_photo_paths text[]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_path text;
  v_paths text[];
begin
  if not public.is_identity_verified() then
    raise exception 'forbidden';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'location_required';
  end if;

  -- deduplicate, then bound: 1-5 distinct photos
  select array_agg(distinct p) into v_paths from unnest(p_photo_paths) as p;
  if v_paths is null or array_length(v_paths, 1) < 1 then
    raise exception 'photos_required';
  end if;
  if array_length(v_paths, 1) > 5 then
    raise exception 'too_many_photos';
  end if;
  foreach v_path in array v_paths loop
    -- photos must live in the caller's own storage folder
    if v_path not like auth.uid()::text || '/%' then
      raise exception 'forbidden';
    end if;
  end loop;
  -- every path must be a real object in the right bucket (definer read of
  -- storage.objects): blocks nonexistent paths and verification-docs paths,
  -- which share the same {uid}/ folder convention
  if (select count(*) from storage.objects
      where bucket_id = 'request-photos' and name = any(v_paths))
     <> array_length(v_paths, 1) then
    raise exception 'photo_not_uploaded';
  end if;

  insert into public.help_requests
    (requester_id, title, description, category, payment_type, amount, lat, lng)
  values
    (auth.uid(), p_title, p_description, p_category, p_payment_type, p_amount, p_lat, p_lng)
  returning id into v_id;

  insert into public.request_photos (request_id, storage_path, position)
  select v_id, u.path, u.ord - 1
  from unnest(v_paths) with ordinality as u(path, ord);

  return v_id;
end $$;

-- 3.2 Assign: the pivotal moment. Guarded updates close the withdraw race;
-- the FOR UPDATE lock serializes concurrent assigns.
create or replace function public.assign_offer(p_request_id uuid, p_offer_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_requester uuid;
begin
  select requester_id into v_requester
    from public.help_requests where id = p_request_id for update;
  -- error-ordering rule: non-owner gets not_found, same as a missing row
  if v_requester is null or v_requester <> auth.uid() then
    raise exception 'not_found';
  end if;

  update public.help_requests
     set status = 'assigned', assigned_offer_id = p_offer_id, assigned_at = now()
   where id = p_request_id and status = 'has_offers';
  if not found then raise exception 'invalid_state'; end if;

  update public.offers
     set status = 'selected'
   where id = p_offer_id and request_id = p_request_id and status = 'active';
  if not found then raise exception 'offer_not_active'; end if;  -- rolls back both

  update public.offers
     set status = 'closed'
   where request_id = p_request_id and status = 'active';
end $$;

-- 3.3 Dual-sided completion: caller's side derived from identity, never a parameter.
create or replace function public.confirm_completion(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_helper uuid;
begin
  select * into v_req from public.help_requests
    where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;

  select helper_id into v_helper from public.offers where id = v_req.assigned_offer_id;
  -- error-ordering rule: party check BEFORE state check
  if auth.uid() <> v_req.requester_id and (v_helper is null or auth.uid() <> v_helper) then
    raise exception 'not_found';
  end if;
  if v_req.status <> 'assigned' then raise exception 'invalid_state'; end if;

  if auth.uid() = v_req.requester_id then
    update public.help_requests set completed_by_requester = true where id = p_request_id;
  else
    update public.help_requests set completed_by_helper = true where id = p_request_id;
  end if;

  update public.help_requests
     set status = 'completed', completed_at = now()
   where id = p_request_id and status = 'assigned'
     and completed_by_requester and completed_by_helper;
end $$;

-- 3.4 Cancel: owner-only, terminal, closes all live offers (cross-owner writes).
create or replace function public.cancel_request(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_requester uuid;
begin
  select requester_id into v_requester
    from public.help_requests where id = p_request_id for update;
  if v_requester is null or v_requester <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;

  update public.help_requests
     set status = 'cancelled', cancelled_at = now()
   where id = p_request_id and status in ('open','has_offers','assigned');
  if not found then raise exception 'invalid_state'; end if;

  update public.offers
     set status = 'closed'
   where request_id = p_request_id and status in ('active','selected');
end $$;

-- 3.5 Rating: insert + completed->rated flip in one transaction.
create or replace function public.submit_rating(
  p_request_id uuid, p_stars int, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_helper uuid;
begin
  select * into v_req from public.help_requests
    where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;
  if v_req.status <> 'completed' then raise exception 'invalid_state'; end if;

  select helper_id into v_helper from public.offers where id = v_req.assigned_offer_id;

  insert into public.ratings (request_id, helper_id, rater_id, stars, note)
  values (p_request_id, v_helper, auth.uid(), p_stars, nullif(trim(p_note), ''));

  update public.help_requests
     set status = 'rated', rated_at = now()
   where id = p_request_id;
end $$;

-- 3.6 Admin: decide an application; flags update atomically with the decision.
create or replace function public.review_application(
  p_application_id uuid, p_approve boolean, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_app public.verification_applications%rowtype;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  select * into v_app from public.verification_applications
    where id = p_application_id for update;
  if not found then raise exception 'not_found'; end if;
  if v_app.status <> 'pending' then raise exception 'invalid_state'; end if;
  -- a rejection must carry a reason (spec 4.1)
  if not p_approve and nullif(trim(p_note), '') is null then
    raise exception 'note_required';
  end if;
  -- a professional badge on a revoked identity is meaningless: re-check the
  -- gate at decision time, not just at application time
  if p_approve and v_app.kind = 'professional' and not exists (
    select 1 from public.profiles
    where id = v_app.user_id and is_identity_verified
  ) then
    raise exception 'invalid_state';
  end if;

  update public.verification_applications
     set status     = case when p_approve then 'approved'::public.application_status
                           else 'rejected'::public.application_status end,
         admin_note = p_note,
         decided_by = auth.uid(),
         decided_at = now()
   where id = p_application_id;

  if p_approve then
    if v_app.kind = 'identity' then
      update public.profiles set is_identity_verified = true where id = v_app.user_id;
      -- the reviewed phone becomes the live contact channel (spec 8.2)
      update public.profiles_private set phone = v_app.phone where user_id = v_app.user_id;
    else
      update public.profiles set is_professional = true where id = v_app.user_id;
    end if;
  end if;
end $$;

-- 3.7 Admin: revoke. Identity revocation also drops the professional badge and
-- kills approved AND pending professional applications.
create or replace function public.revoke_verification(
  p_user_id uuid, p_kind public.application_kind
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;

  update public.verification_applications
     set status = 'revoked', decided_by = auth.uid(), decided_at = now()
   where user_id = p_user_id and kind = p_kind and status = 'approved';
  if not found then raise exception 'not_found'; end if;

  if p_kind = 'identity' then
    update public.profiles
       set is_identity_verified = false, is_professional = false
     where id = p_user_id;
    update public.verification_applications
       set status = 'revoked', decided_by = auth.uid(), decided_at = now()
     where user_id = p_user_id and kind = 'professional'
       and status in ('approved','pending');
  else
    update public.profiles set is_professional = false where id = p_user_id;
  end if;
end $$;

-- 3.8 Admin: moderation flag only — lifecycle state untouched by construction.
create or replace function public.set_request_hidden(
  p_request_id uuid, p_hidden boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.help_requests set is_hidden = p_hidden where id = p_request_id;
  if not found then raise exception 'not_found'; end if;
end $$;

-- 3.9 Paid marker: RPC rather than an UPDATE policy on purpose — a second
-- permissive UPDATE policy on help_requests would OR its USING with the
-- content-edit policy's lax CHECK and reopen content edits on finished jobs.
create or replace function public.mark_paid(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_req public.help_requests%rowtype;
begin
  select * into v_req from public.help_requests
    where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;
  if v_req.status not in ('completed','rated')
     or v_req.payment_type <> 'paid' or v_req.is_paid then
    raise exception 'invalid_state';
  end if;
  update public.help_requests set is_paid = true where id = p_request_id;
end $$;

-- 3.10 The only read RPC: counterpart contact, post-assignment, parties only.
create or replace function public.get_counterpart_contact(p_request_id uuid)
returns table (display_name text, phone text)
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_helper uuid;
  v_other uuid;
begin
  select * into v_req from public.help_requests where id = p_request_id;
  if not found then raise exception 'not_found'; end if;

  select helper_id into v_helper from public.offers where id = v_req.assigned_offer_id;
  -- error-ordering rule: party check first — probing a hidden/cancelled id
  -- must not reveal that the row exists or what state it is in
  if auth.uid() = v_req.requester_id then v_other := v_helper;
  elsif v_helper is not null and auth.uid() = v_helper then v_other := v_req.requester_id;
  else raise exception 'not_found';
  end if;

  if v_req.status not in ('assigned','completed','rated') then
    raise exception 'invalid_state';
  end if;

  return query
    select p.display_name, pp.phone
    from public.profiles p
    join public.profiles_private pp on pp.user_id = p.id
    where p.id = v_other;
end $$;

-- ---------------------------------------------------------------------------
-- Execute grants: authenticated only
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.is_admin(),
  public.is_identity_verified(),
  public.is_selected_helper(uuid),
  public.create_request_with_photos(text, text, text, public.payment_type, numeric, double precision, double precision, text[]),
  public.assign_offer(uuid, uuid),
  public.confirm_completion(uuid),
  public.cancel_request(uuid),
  public.submit_rating(uuid, int, text),
  public.review_application(uuid, boolean, text),
  public.revoke_verification(uuid, public.application_kind),
  public.set_request_hidden(uuid, boolean),
  public.mark_paid(uuid),
  public.get_counterpart_contact(uuid)
to authenticated;
