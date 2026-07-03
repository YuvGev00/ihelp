-- iHelp: explicit table grants — least privilege, pinned in-migration.
--
-- Why this migration exists: Supabase's implicit default privileges proved
-- unreliable across CLI/image versions (tables came up without DML grants for
-- the API roles). Instead of depending on platform defaults, every verb each
-- role holds is stated here, and it is the MINIMUM the RLS policies use:
--
-- * authenticated gets NO INSERT on help_requests / request_photos / ratings —
--   those writes exist only inside SECURITY DEFINER RPCs (owner-privileged),
--   so even a policy mistake could not open direct inserts.
-- * authenticated gets NO DELETE anywhere — nothing in the product deletes rows.
-- * anon gets nothing in public (the emergency page and landing read no data).
-- * service_role keeps ALL: it bypasses RLS by design and serves local tooling
--   (seed script, tests) and the storage/auth internals.

grant usage on schema public to anon, authenticated, service_role;

-- authenticated: exactly the verbs the policies of 0006 authorize
grant select, update          on public.profiles                  to authenticated;
grant select, update          on public.profiles_private          to authenticated;
grant select, insert          on public.verification_applications to authenticated;
grant select, update          on public.help_requests             to authenticated;
grant select, insert, update  on public.offers                    to authenticated;
grant select                  on public.request_photos            to authenticated;
grant select                  on public.ratings                   to authenticated;
-- (helper_ratings view grant lives in 0006 next to the view definition)

-- service_role: full access (RLS-bypassing by design; never used by app code)
grant all on all tables in schema public to service_role;
