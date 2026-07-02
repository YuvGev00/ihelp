-- iHelp schema: enums (design doc 03 §1.1)
-- Enums over text+CHECK: these are closed state sets the whole design leans on;
-- an invalid state becomes a type error. category deliberately stays text+CHECK
-- (content, not a state machine — see 0002).

create type public.request_status as enum
  ('open','has_offers','assigned','completed','rated','cancelled');

create type public.offer_status as enum
  ('active','selected','closed','withdrawn');

create type public.application_kind as enum ('identity','professional');

create type public.application_status as enum
  ('pending','approved','rejected','revoked');

create type public.payment_type as enum ('paid','volunteer');
