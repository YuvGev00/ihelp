-- iHelp SECURITY FIX (2026-08-11): close the final_price INSERT bypass.
--
-- The offers_insert policy never constrained final_price, price_matches_mode
-- (0010) constrained only `price`, and the column guard is BEFORE UPDATE only —
-- so a verified helper could INSERT an after_job offer with final_price already
-- set to any number, bypassing the entire set_final_price RPC guard chain (which
-- only runs post-completion, for the selected helper, once). That fabricated
-- number then flowed straight into mark_paid's coalesce(price, final_price) as
-- the "agreed" amount, and permanently blocked the legitimate after-job pricing.
--
-- final_price is written ONLY by set_final_price (SECURITY DEFINER, bypasses
-- RLS), so no legitimate INSERT ever needs it: pin it null at insert time.

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

-- Defense in depth: the row-level CHECK now also forbids a non-null final_price
-- in the fixed/volunteer/after_job branches at INSERT (and any non-definer
-- UPDATE), so the invariant holds even if a future policy edit forgets the pin.
alter table public.offers drop constraint price_matches_mode;
alter table public.offers add constraint price_matches_mode check (
  (pricing_mode = 'fixed'     and price is not null) or
  (pricing_mode = 'volunteer' and price is null and final_price is null) or
  (pricing_mode = 'after_job' and price is null)
);
