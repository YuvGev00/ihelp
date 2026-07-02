-- iHelp schema: indexes (design doc 03 §1.3). Each maps to a page.

create index idx_requests_browse  on public.help_requests (status, is_hidden, created_at desc);
create index idx_requests_owner   on public.help_requests (requester_id, created_at desc);
create index idx_offers_request   on public.offers (request_id) where status = 'active';
create index idx_offers_helper    on public.offers (helper_id, created_at desc);
create index idx_photos_request   on public.request_photos (request_id, position);
create index idx_ratings_helper   on public.ratings (helper_id);
create index idx_applications_queue on public.verification_applications (status, created_at)
  where status = 'pending';
