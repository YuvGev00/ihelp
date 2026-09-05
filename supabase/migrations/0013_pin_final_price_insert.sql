-- iHelp: the offers_insert policy pins final_price null at insert time.
--
-- final_price is written only by set_final_price (SECURITY DEFINER, bypasses
-- RLS), which runs post-completion, for the selected helper, once. No INSERT
-- needs to set final_price, so the insert policy requires it to be null and the
-- amount is set solely through that guarded RPC.

drop policy offers_insert on public.offers;
create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    helper_id = auth.uid()
    and status = 'active'
    and final_price is null                       -- set only via set_final_price
    and public.is_identity_verified()
    and exists (select 1 from public.help_requests r
                where r.id = request_id
                  and r.requester_id <> auth.uid()
                  and r.status in ('open','has_offers')
                  and not r.is_hidden)
  );

-- Defense in depth: the row-level CHECK also forbids a non-null final_price
-- in the fixed/volunteer/after_job branches at INSERT (and any non-definer
-- UPDATE), so the invariant holds even if a future policy edit forgets the pin.
alter table public.offers drop constraint price_matches_mode;
alter table public.offers add constraint price_matches_mode check (
  (pricing_mode = 'fixed'     and price is not null) or
  (pricing_mode = 'volunteer' and price is null and final_price is null) or
  (pricing_mode = 'after_job' and price is null)
);
