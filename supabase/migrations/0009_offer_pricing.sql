-- iHelp: pricing lives on the offer, not the request.
-- Each offer carries a price, or none (= volunteering). A helper may volunteer
-- on any request.

-- 1. Requests lose the requester-set amount.
alter table public.help_requests drop constraint amount_matches_type;
alter table public.help_requests drop column amount;

-- 2. Offers carry a price (or none = volunteering).
alter table public.offers drop column proposed_terms;
alter table public.offers add column price numeric(10,2)
  check (price is null or (price > 0 and price <= 99999.99));

-- 3. Offer policies re-pinned: the volunteer-request rule is cross-table, so
-- it lives in the INSERT/UPDATE conditions (a CHECK cannot join).
drop policy offers_insert on public.offers;
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
                  and not r.is_hidden
                  -- price allowed only where the requester offered to pay;
                  -- a free (null-price) offer is allowed anywhere
                  and (price is null or r.payment_type = 'paid'))
  );

drop policy offers_update_own on public.offers;
create policy offers_update_own on public.offers
  for update to authenticated
  using (helper_id = auth.uid() and status = 'active')
  with check (
    helper_id = auth.uid()
    and status in ('active','withdrawn')
    and (price is null or exists (select 1 from public.help_requests r
                                  where r.id = request_id
                                    and r.payment_type = 'paid'))
  );

-- 4. create_request_with_photos loses its amount parameter (signature change:
-- drop + recreate + regrant).
drop function public.create_request_with_photos(
  text, text, text, public.payment_type, numeric,
  double precision, double precision, text[]);

create or replace function public.create_request_with_photos(
  p_title text, p_description text, p_category text,
  p_payment_type public.payment_type,
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

  select array_agg(distinct p) into v_paths from unnest(p_photo_paths) as p;
  if v_paths is null or array_length(v_paths, 1) < 1 then
    raise exception 'photos_required';
  end if;
  if array_length(v_paths, 1) > 5 then
    raise exception 'too_many_photos';
  end if;
  foreach v_path in array v_paths loop
    if v_path not like auth.uid()::text || '/%' then
      raise exception 'forbidden';
    end if;
  end loop;
  if (select count(*) from storage.objects
      where bucket_id = 'request-photos' and name = any(v_paths))
     <> array_length(v_paths, 1) then
    raise exception 'photo_not_uploaded';
  end if;

  insert into public.help_requests
    (requester_id, title, description, category, payment_type, lat, lng)
  values
    (auth.uid(), p_title, p_description, p_category, p_payment_type, p_lat, p_lng)
  returning id into v_id;

  insert into public.request_photos (request_id, storage_path, position)
  select v_id, u.path, u.ord - 1
  from unnest(v_paths) with ordinality as u(path, ord);

  return v_id;
end $$;

revoke execute on function public.create_request_with_photos(
  text, text, text, public.payment_type,
  double precision, double precision, text[]) from public, anon;
grant execute on function public.create_request_with_photos(
  text, text, text, public.payment_type,
  double precision, double precision, text[]) to authenticated;

-- 5. mark_paid keys off the AGREED price — the selected offer's. A volunteered
-- job has nothing to mark as paid.
create or replace function public.mark_paid(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_price numeric;
begin
  select * into v_req from public.help_requests
    where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_found';   -- error-ordering rule
  end if;

  select price into v_price from public.offers where id = v_req.assigned_offer_id;
  if v_req.status not in ('completed','rated')
     or v_price is null or v_req.is_paid then
    raise exception 'invalid_state';
  end if;
  update public.help_requests set is_paid = true where id = p_request_id;
end $$;
