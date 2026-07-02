-- iHelp: trigger functions (design doc 03 §3, T1-T4)

-- T1 (SECURITY DEFINER): signup — create both profile rows before any session exists.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.profiles_private (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- T2 (SECURITY DEFINER): offer lifecycle keeps request open <-> has_offers true,
-- and closes the race where an offer lands on a just-assigned request. Definer
-- because a helper's insert must update the requester's request row.
create or replace function public.sync_request_offer_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_request_id uuid := coalesce(new.request_id, old.request_id);
  v_status public.request_status;
  v_active int;
begin
  select status into v_status from public.help_requests
    where id = v_request_id for update;              -- waits out concurrent assign/cancel

  if v_status in ('open','has_offers') then
    select count(*) into v_active from public.offers
      where request_id = v_request_id and status = 'active';
    update public.help_requests
       set status = case when v_active > 0 then 'has_offers'::public.request_status
                         else 'open'::public.request_status end
     where id = v_request_id and status <> (case when v_active > 0
       then 'has_offers'::public.request_status else 'open'::public.request_status end);
  elsif tg_op = 'INSERT' and new.status = 'active' then
    -- request left the offerable states while this insert was in flight
    update public.offers set status = 'closed' where id = new.id;
  end if;
  return new;
end $$;
create trigger on_offer_change after insert or update of status on public.offers
  for each row execute function public.sync_request_offer_status();

-- T3 (deliberately INVOKER-RIGHTS): column guard — RLS cannot restrict WHICH
-- columns an UPDATE changes. Direct PostgREST writes run as role
-- 'authenticated'; definer RPCs run as the function owner and pass through.
create or replace function public.guard_protected_columns() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;                                       -- privileged path (RPCs, SQL console)
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
    -- a phone may be changed but never removed once set: the contact-reveal
    -- flow must not surface an empty phone for a verified user
    if old.phone is not null and new.phone is null then
      raise exception 'forbidden';
    end if;
  elsif tg_table_name = 'offers' then
    if new.request_id is distinct from old.request_id
       or new.helper_id is distinct from old.helper_id
       or new.request_title is distinct from old.request_title
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
       or new.is_paid is distinct from old.is_paid then   -- is_paid: mark_paid RPC only
      raise exception 'forbidden';
    end if;
  end if;
  return new;
end $$;

create trigger guard_profiles before update on public.profiles
  for each row execute function public.guard_protected_columns();
create trigger guard_profiles_private before update on public.profiles_private
  for each row execute function public.guard_protected_columns();
create trigger guard_help_requests before update on public.help_requests
  for each row execute function public.guard_protected_columns();
create trigger guard_offers before update on public.offers
  for each row execute function public.guard_protected_columns();

-- T4 (invoker-rights): offer-insert preparation. Normalizes server-controlled
-- fields and takes the title snapshot /my/offers renders after the parent
-- becomes invisible. The parent request is visible to the inserter by policy.
create or replace function public.prepare_offer_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.created_at := now();                       -- never caller-supplied
  select title into new.request_title
    from public.help_requests where id = new.request_id;
  return new;
end $$;
create trigger on_offer_insert before insert on public.offers
  for each row execute function public.prepare_offer_insert();

-- Trigger functions are invoked by triggers only — nobody calls them via the
-- API. The 0004 blanket revoke ran before these existed (and Postgres grants
-- EXECUTE to PUBLIC on new functions by default), so revoke explicitly.
revoke execute on function
  public.handle_new_user(),
  public.sync_request_offer_status(),
  public.guard_protected_columns(),
  public.prepare_offer_insert()
from public, anon, authenticated;
