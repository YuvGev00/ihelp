-- iHelp: three offer stances (product change 2026-07-06).
--
-- Before: offers.price null meant "volunteering" — but a helper often cannot
-- quote a price before seeing the problem (a plumber, an electrician). So an
-- offer now declares one of three PRICING MODES:
--   'fixed'      → price set now, in offers.price
--   'volunteer'  → free, price stays null forever
--   'after_job'  → price unknown until the work is done; the helper sets the
--                  final amount once the request is `completed` (final_price).
--
-- This makes null-price ambiguous no longer: 'volunteer' means free,
-- 'after_job' with a null price means "to be determined".

create type public.pricing_mode as enum ('fixed', 'volunteer', 'after_job');

alter table public.offers
  add column pricing_mode public.pricing_mode not null default 'volunteer',
  add column final_price  numeric(10,2)
    check (final_price is null or (final_price > 0 and final_price <= 99999.99));

-- Backfill BEFORE adding the coupling constraint: a priced offer was 'fixed'
-- under the old model, a null-price offer was a volunteer. Adding the CHECK
-- first would fail on the momentarily-'volunteer'-with-price rows.
update public.offers set pricing_mode = 'fixed'     where price is not null;
update public.offers set pricing_mode = 'volunteer' where price is null;

-- price semantics per mode, enforced at the row:
--   fixed      → price present (the quote)
--   volunteer  → price null, final_price null
--   after_job  → price null at offer time (final_price filled later)
alter table public.offers add constraint price_matches_mode check (
  (pricing_mode = 'fixed'     and price is not null) or
  (pricing_mode = 'volunteer' and price is null and final_price is null) or
  (pricing_mode = 'after_job' and price is null)
);

-- The offer INSERT/UPDATE policies referenced the old "price only on paid
-- requests" rule; extend it so the paid-request gate covers BOTH ways a helper
-- can charge (a fixed price now, or the after_job mode). Volunteering is
-- allowed anywhere.
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
                  -- charging (fixed or after_job) only where the requester
                  -- offered to pay; volunteering is allowed anywhere
                  and (pricing_mode = 'volunteer' or r.payment_type = 'paid'))
  );

drop policy offers_update_own on public.offers;
create policy offers_update_own on public.offers
  for update to authenticated
  using (helper_id = auth.uid() and status = 'active')
  with check (
    helper_id = auth.uid()
    and status in ('active','withdrawn')
    and (pricing_mode = 'volunteer'
         or exists (select 1 from public.help_requests r
                    where r.id = request_id and r.payment_type = 'paid'))
  );

-- The column guard must protect pricing_mode and final_price on the offer:
-- pricing_mode is set at insert and never changes; final_price is written only
-- by the set_final_price RPC (below), never by a direct PATCH.
create or replace function public.guard_protected_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if tg_table_name = 'profiles' then
    if new.is_identity_verified is distinct from old.is_identity_verified
       or new.is_professional  is distinct from old.is_professional then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'profiles_private' then
    if new.is_admin is distinct from old.is_admin then
      raise exception 'forbidden';
    end if;
    if old.phone is not null and new.phone is null then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'offers' then
    if new.request_id is distinct from old.request_id
       or new.helper_id is distinct from old.helper_id
       or new.request_title is distinct from old.request_title
       or new.pricing_mode is distinct from old.pricing_mode
       or new.final_price is distinct from old.final_price   -- set_final_price RPC only
       or new.created_at is distinct from old.created_at then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'help_requests' then
    if new.status is distinct from old.status
       or new.is_hidden is distinct from old.is_hidden
       or new.assigned_offer_id is distinct from old.assigned_offer_id
       or new.completed_by_requester is distinct from old.completed_by_requester
       or new.completed_by_helper is distinct from old.completed_by_helper
       or new.requester_id is distinct from old.requester_id
       or new.created_at is distinct from old.created_at
       or new.assigned_at is distinct from old.assigned_at
       or new.completed_at is distinct from old.completed_at
       or new.rated_at is distinct from old.rated_at
       or new.cancelled_at is distinct from old.cancelled_at
       or new.is_paid is distinct from old.is_paid then
      raise exception 'forbidden';
    end if;
  end if;
  return new;
end $$;

-- New RPC: the selected helper of an `after_job` offer sets the final price
-- once the request is completed (or rated — the requester may still mark paid).
create or replace function public.set_final_price(p_request_id uuid, p_price numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_offer public.offers%rowtype;
begin
  if p_price is null or p_price <= 0 or p_price > 99999.99 then
    raise exception 'invalid_price';
  end if;

  select * into v_req from public.help_requests where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;

  select * into v_offer from public.offers where id = v_req.assigned_offer_id;
  -- error-ordering rule: only the selected helper can price; anyone else 404s
  if v_offer.helper_id is null or v_offer.helper_id <> auth.uid() then
    raise exception 'not_found';
  end if;
  if v_req.status not in ('completed','rated')
     or v_offer.pricing_mode <> 'after_job'
     or v_offer.final_price is not null then
    raise exception 'invalid_state';
  end if;

  update public.offers set final_price = p_price where id = v_offer.id;
end $$;

revoke execute on function public.set_final_price(uuid, numeric) from public, anon;
grant execute on function public.set_final_price(uuid, numeric) to authenticated;

-- mark_paid now recognizes an agreed amount from EITHER a fixed price or a
-- set after_job final price (a volunteer job still has nothing to mark).
create or replace function public.mark_paid(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_req public.help_requests%rowtype;
  v_offer public.offers%rowtype;
  v_agreed numeric;
begin
  select * into v_req from public.help_requests where id = p_request_id for update;
  if not found or v_req.requester_id <> auth.uid() then
    raise exception 'not_found';
  end if;
  select * into v_offer from public.offers where id = v_req.assigned_offer_id;
  v_agreed := coalesce(v_offer.price, v_offer.final_price);  -- fixed OR set after_job
  if v_req.status not in ('completed','rated')
     or v_agreed is null or v_req.is_paid then
    raise exception 'invalid_state';
  end if;
  update public.help_requests set is_paid = true where id = p_request_id;
end $$;
