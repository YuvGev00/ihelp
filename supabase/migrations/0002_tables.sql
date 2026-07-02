-- iHelp schema: tables (design doc 03 §1.2)

-- Public profile: everything here is readable by any signed-in user.
create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text not null default ''
                       check (char_length(display_name) <= 40),
  is_identity_verified boolean not null default false,   -- set only by review_application / revoke_verification
  is_professional      boolean not null default false,   -- set only by review_application / revoke_verification
  created_at           timestamptz not null default now()
);

-- Private profile: own-row access only. Separate table because Postgres RLS is
-- row-level; these columns must never ride along with the broadly-readable row.
create table public.profiles_private (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  phone      text check (phone is null or phone ~ '^0\d{8,9}$'),
  lat        double precision check (lat between -90 and 90),
  lng        double precision check (lng between -180 and 180),
  constraint location_all_or_none check ((lat is null) = (lng is null)),
  is_admin   boolean not null default false              -- set only manually in SQL
);

create table public.verification_applications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  kind             public.application_kind not null,
  status           public.application_status not null default 'pending',
  full_name        text not null check (char_length(full_name) between 2 and 60),
  self_description text not null default '' check (char_length(self_description) <= 500),
  -- the phone is part of the reviewed identity application (spec 8.2) — the
  -- admin must see it via applications_select; review_application copies it to
  -- profiles_private on identity approval
  phone            text check (phone is null or phone ~ '^0\d{8,9}$'),
  constraint identity_requires_phone check (kind <> 'identity' or phone is not null),
  doc_path         text,            -- ID photo / certificate in verification-docs
  constraint professional_requires_doc check (kind <> 'professional' or doc_path is not null),
  admin_note       text,
  decided_by       uuid references public.profiles(id),
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);

-- At most one pending-or-approved application per user per kind (spec 9.2).
-- Rejected/revoked rows remain as the audit trail and do not block re-apply.
create unique index one_open_application_per_kind
  on public.verification_applications (user_id, kind)
  where status in ('pending','approved');

create table public.help_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 80),
  description   text not null check (char_length(description) between 10 and 2000),
  -- category is content, not a state machine: text+CHECK keeps additions a
  -- data-shaped migration; lib/categories.ts is the app-side canonical list.
  category      text not null check (category in
                  ('repairs','electricity','plumbing','moving','tutoring',
                   'tech_help','errands','gardening','pets','other')),
  payment_type  public.payment_type not null,
  amount        numeric(10,2),
  -- paid requests carry a positive bounded amount; volunteer requests carry none
  constraint amount_matches_type check (
    (payment_type = 'paid'      and amount is not null and amount > 0 and amount <= 99999.99) or
    (payment_type = 'volunteer' and amount is null)
  ),
  -- request location, confirmed by the requester at publish time. NOT NULL:
  -- a request helpers cannot locate defeats the distance-sorted marketplace.
  lat           double precision not null check (lat between -90 and 90),
  lng           double precision not null check (lng between -180 and 180),
  status        public.request_status not null default 'open',
  is_hidden     boolean not null default false,          -- admin moderation flag
  assigned_offer_id      uuid,                           -- FK added below (circular)
  completed_by_requester boolean not null default false,
  completed_by_helper    boolean not null default false,
  is_paid       boolean not null default false,          -- owner's marker, via mark_paid RPC
  created_at    timestamptz not null default now(),
  assigned_at   timestamptz,
  completed_at  timestamptz,
  rated_at      timestamptz,
  cancelled_at  timestamptz
);

create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references public.help_requests(id) on delete cascade,
  helper_id      uuid not null references public.profiles(id) on delete cascade,
  status         public.offer_status not null default 'active',
  message        text not null check (char_length(message) between 5 and 1000),
  proposed_terms text check (proposed_terms is null or char_length(proposed_terms) <= 300),
  -- snapshot set by trigger at insert: /my/offers must render meaningfully even
  -- after the offerer loses SELECT on the parent request (spec 9.2 visibility)
  request_title  text not null default '',
  created_at     timestamptz not null default now()
);

-- One *active* offer per helper per request (spec 9.2). Withdrawn/closed rows
-- do not block a new offer while the request is still open.
create unique index one_active_offer_per_helper
  on public.offers (request_id, helper_id) where (status = 'active');

-- Circular FK, added after both tables exist:
alter table public.help_requests
  add constraint fk_assigned_offer
  foreign key (assigned_offer_id) references public.offers(id);

create table public.request_photos (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.help_requests(id) on delete cascade,
  storage_path text not null,
  position     int not null default 0,
  created_at   timestamptz not null default now()
);

create table public.ratings (
  -- PK on request_id: one rating per request, by construction (spec 9.2)
  request_id uuid primary key references public.help_requests(id) on delete cascade,
  helper_id  uuid not null references public.profiles(id) on delete cascade,
  rater_id   uuid not null references public.profiles(id) on delete cascade,
  stars      int not null check (stars between 1 and 5),
  note       text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
