-- ============================================================
-- Crosslay 0005: lat/lng computed columns for preplans
--
-- PostgREST serializes geometry as WKB hex; these computed columns let
-- the client select plain coordinates: .select('*, lat, lng')
-- ============================================================

create or replace function public.lat(p public.preplans)
returns double precision
language sql immutable
as $$ select extensions.st_y(p.geom) $$;

create or replace function public.lng(p public.preplans)
returns double precision
language sql immutable
as $$ select extensions.st_x(p.geom) $$;

revoke execute on function public.lat(public.preplans) from public, anon;
revoke execute on function public.lng(public.preplans) from public, anon;
grant  execute on function public.lat(public.preplans) to authenticated;
grant  execute on function public.lng(public.preplans) to authenticated;
