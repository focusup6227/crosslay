-- ============================================================
-- Crosslay 0001_init: schema, RLS, helper functions, storage
--
-- Decisions baked in (2026-06-10):
--   * Multiple documents per preplan (preplan_documents table)
--   * preplans.last_reviewed for review-cycle tracking
--   * Any department member can edit any preplan
--   * No unique constraint on address (suites file separately)
-- ============================================================

-- extensions live outside public so spatial_ref_sys etc. are not API-exposed
create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------- Core tables ----------

create table public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique default encode(gen_random_bytes(6), 'hex'),
  created_at  timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  department_id uuid references public.departments(id),
  role          text not null default 'member' check (role in ('admin','member')),
  created_at    timestamptz not null default now()
);

-- ---------- Helper functions (security definer to avoid RLS recursion) ----------

create or replace function public.current_department_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select department_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'admin' from public.profiles where id = auth.uid()),
    false
  )
$$;

-- ---------- Domain tables ----------

create table public.preplans (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null default public.current_department_id()
                   references public.departments(id),
  address        text not null,
  building_name  text,
  occupancy_type text,
  geom           extensions.geometry(Point, 4326),
  contacts       jsonb not null default '[]',
  hazards        text,
  notes          text,
  last_reviewed  date,
  created_by     uuid not null default auth.uid() references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.preplan_documents (
  id         uuid primary key default gen_random_uuid(),
  preplan_id uuid not null references public.preplans(id) on delete cascade,
  file_url   text not null,
  title      text,                      -- "Scanned preplan", "Floor plan — Bldg B"
  sort_order integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.preplan_photos (
  id         uuid primary key default gen_random_uuid(),
  preplan_id uuid not null references public.preplans(id) on delete cascade,
  photo_url  text not null,
  caption    text,
  geom       extensions.geometry(Point, 4326),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.hydrants (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null default public.current_department_id()
                   references public.departments(id),
  geom           extensions.geometry(Point, 4326) not null,
  flow_gpm       integer,
  flow_class     text check (flow_class in ('blue','green','orange','red')),
  main_size      text,
  status         text not null default 'in_service'
                   check (status in ('in_service','out_of_service','unknown')),
  status_note    text,
  source         text check (source in ('osm','gis_import','manual')),
  external_id    text,
  last_inspected date,
  updated_by     uuid default auth.uid() references public.profiles(id),
  updated_at     timestamptz not null default now()
);

-- ---------- Indexes ----------

create index preplans_dept_idx           on public.preplans (department_id);
create index preplans_geom_idx           on public.preplans using gist (geom);
create index preplans_address_trgm       on public.preplans using gin (address extensions.gin_trgm_ops);
create index preplans_bldg_trgm          on public.preplans using gin (building_name extensions.gin_trgm_ops);
create index preplan_documents_plan_idx  on public.preplan_documents (preplan_id);
create index preplan_photos_plan_idx     on public.preplan_photos (preplan_id);
create index hydrants_dept_idx           on public.hydrants (department_id);
create index hydrants_geom_idx           on public.hydrants using gist (geom);
-- re-import dedup: same source+external_id within a department updates instead of duplicating
create unique index hydrants_dedup_idx   on public.hydrants (department_id, source, external_id)
  where external_id is not null;

-- ---------- Triggers ----------

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger preplans_touch before update on public.preplans
  for each row execute function public.touch_updated_at();
create trigger hydrants_touch before update on public.hydrants
  for each row execute function public.touch_updated_at();

-- derive NFPA 291 flow class whenever flow_gpm is present
create or replace function public.derive_flow_class()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.flow_gpm is not null then
    new.flow_class := case
      when new.flow_gpm >= 1500 then 'blue'
      when new.flow_gpm >= 1000 then 'green'
      when new.flow_gpm >= 500  then 'orange'
      else 'red'
    end;
  end if;
  return new;
end $$;

create trigger hydrants_flow_class before insert or update on public.hydrants
  for each row execute function public.derive_flow_class();

-- members may only change status fields on hydrants; everything else is admin-only
create or replace function public.guard_hydrant_update()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    if new.geom::text is distinct from old.geom::text
       or new.flow_gpm      is distinct from old.flow_gpm
       or new.flow_class    is distinct from old.flow_class
       or new.main_size     is distinct from old.main_size
       or new.source        is distinct from old.source
       or new.external_id   is distinct from old.external_id
       or new.department_id is distinct from old.department_id then
      raise exception 'Members may only update hydrant status, note, and inspection date';
    end if;
  end if;
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger hydrants_guard before update on public.hydrants
  for each row execute function public.guard_hydrant_update();

-- auto-create a profile row on signup (department joined later via invite code)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- protect role/department_id from self-service changes
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role
      or new.department_id is distinct from old.department_id) then
    if coalesce(current_setting('crosslay.bypass_profile_guard', true), '') <> 'on'
       and not public.is_admin() then
      raise exception 'Only admins can change role or department membership';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------- Onboarding RPCs ----------

-- first user creates the department and becomes admin
create or replace function public.create_department(dept_name text)
returns public.departments
language plpgsql security definer set search_path = public as $$
declare
  dept public.departments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_department_id() is not null then
    raise exception 'You already belong to a department';
  end if;

  insert into public.departments (name) values (trim(dept_name)) returning * into dept;

  perform set_config('crosslay.bypass_profile_guard', 'on', true);
  update public.profiles
     set department_id = dept.id, role = 'admin'
   where id = auth.uid();

  return dept;
end $$;

-- everyone else joins with the invite code
create or replace function public.join_department(code text)
returns public.departments
language plpgsql security definer set search_path = public as $$
declare
  dept public.departments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if public.current_department_id() is not null then
    raise exception 'You already belong to a department';
  end if;

  select * into dept from public.departments
   where invite_code = lower(trim(code));
  if not found then
    raise exception 'Invalid invite code';
  end if;

  perform set_config('crosslay.bypass_profile_guard', 'on', true);
  update public.profiles
     set department_id = dept.id, role = 'member'
   where id = auth.uid();

  return dept;
end $$;

-- ---------- Nearest hydrants (Phase 3; security invoker so RLS applies) ----------

create or replace function public.nearest_hydrants(p_preplan_id uuid, p_limit int default 5)
returns table (
  id uuid, distance_ft numeric, flow_gpm integer, flow_class text,
  status text, status_note text, main_size text, lng double precision, lat double precision
)
language sql stable security invoker set search_path = public, extensions as $$
  select h.id,
         round((st_distance(h.geom::geography, p.geom::geography) * 3.28084)::numeric, 0),
         h.flow_gpm, h.flow_class, h.status, h.status_note, h.main_size,
         st_x(h.geom), st_y(h.geom)
    from public.hydrants h
    join public.preplans p on p.id = p_preplan_id
   where p.geom is not null
   order by h.geom <-> p.geom
   limit p_limit
$$;

-- ---------- Function execute grants ----------
-- Postgres grants EXECUTE to PUBLIC by default; tighten so trigger/helper
-- functions are not callable via /rest/v1/rpc and RPCs require sign-in.

revoke execute on function public.touch_updated_at()      from public, anon, authenticated;
revoke execute on function public.derive_flow_class()     from public, anon, authenticated;
revoke execute on function public.guard_hydrant_update()  from public, anon, authenticated;
revoke execute on function public.handle_new_user()       from public, anon, authenticated;
revoke execute on function public.guard_profile_update()  from public, anon, authenticated;

revoke execute on function public.current_department_id()           from public, anon;
revoke execute on function public.is_admin()                        from public, anon;
revoke execute on function public.create_department(text)           from public, anon;
revoke execute on function public.join_department(text)             from public, anon;
revoke execute on function public.nearest_hydrants(uuid, int)       from public, anon;

grant execute on function public.current_department_id()      to authenticated;
grant execute on function public.is_admin()                    to authenticated;
grant execute on function public.create_department(text)       to authenticated;
grant execute on function public.join_department(text)         to authenticated;
grant execute on function public.nearest_hydrants(uuid, int)   to authenticated;

-- ---------- Row Level Security ----------

alter table public.departments       enable row level security;
alter table public.profiles          enable row level security;
alter table public.preplans          enable row level security;
alter table public.preplan_documents enable row level security;
alter table public.preplan_photos    enable row level security;
alter table public.hydrants          enable row level security;

-- departments: see your own; rename admin-only; create/join only via RPCs
create policy departments_select on public.departments for select to authenticated
  using (id = public.current_department_id());
create policy departments_update on public.departments for update to authenticated
  using (id = public.current_department_id() and public.is_admin());

-- profiles: own row + same-department roster
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid()
         or (department_id is not null and department_id = public.current_department_id()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin() and department_id = public.current_department_id())
  with check (department_id = public.current_department_id());

-- preplans: dept members read, create, and edit any; admin deletes
create policy preplans_select on public.preplans for select to authenticated
  using (department_id = public.current_department_id());
create policy preplans_insert on public.preplans for insert to authenticated
  with check (department_id = public.current_department_id());
create policy preplans_update on public.preplans for update to authenticated
  using (department_id = public.current_department_id())
  with check (department_id = public.current_department_id());
create policy preplans_delete on public.preplans for delete to authenticated
  using (department_id = public.current_department_id() and public.is_admin());

-- documents: dept members read + add; admin deletes (membership via parent preplan)
create policy documents_select on public.preplan_documents for select to authenticated
  using (exists (select 1 from public.preplans p
                 where p.id = preplan_id
                   and p.department_id = public.current_department_id()));
create policy documents_insert on public.preplan_documents for insert to authenticated
  with check (exists (select 1 from public.preplans p
                      where p.id = preplan_id
                        and p.department_id = public.current_department_id()));
create policy documents_delete on public.preplan_documents for delete to authenticated
  using (public.is_admin()
         and exists (select 1 from public.preplans p
                     where p.id = preplan_id
                       and p.department_id = public.current_department_id()));

-- photos: dept members read + add; admin deletes
create policy photos_select on public.preplan_photos for select to authenticated
  using (exists (select 1 from public.preplans p
                 where p.id = preplan_id
                   and p.department_id = public.current_department_id()));
create policy photos_insert on public.preplan_photos for insert to authenticated
  with check (exists (select 1 from public.preplans p
                      where p.id = preplan_id
                        and p.department_id = public.current_department_id()));
create policy photos_delete on public.preplan_photos for delete to authenticated
  using (public.is_admin()
         and exists (select 1 from public.preplans p
                     where p.id = preplan_id
                       and p.department_id = public.current_department_id()));

-- hydrants: dept members read + flag status (field guard via trigger);
-- admins insert/import; admins delete
create policy hydrants_select on public.hydrants for select to authenticated
  using (department_id = public.current_department_id());
create policy hydrants_insert on public.hydrants for insert to authenticated
  with check (department_id = public.current_department_id() and public.is_admin());
create policy hydrants_update on public.hydrants for update to authenticated
  using (department_id = public.current_department_id())
  with check (department_id = public.current_department_id());
create policy hydrants_delete on public.hydrants for delete to authenticated
  using (department_id = public.current_department_id() and public.is_admin());

-- ---------- Data API grants ----------
-- Grant only what RLS permits; anon gets nothing (app is authenticated-only,
-- onboarding goes through security-definer RPCs). The revoke clears legacy
-- default privileges on projects that still auto-grant ALL to API roles.

revoke all on public.departments, public.profiles, public.preplans,
              public.preplan_documents, public.preplan_photos, public.hydrants
  from anon, authenticated;

grant select, update                 on public.departments       to authenticated;
grant select, update                 on public.profiles          to authenticated;
grant select, insert, update, delete on public.preplans          to authenticated;
grant select, insert, delete         on public.preplan_documents to authenticated;
grant select, insert, delete         on public.preplan_photos    to authenticated;
grant select, insert, update, delete on public.hydrants          to authenticated;

-- ---------- Storage ----------
-- Path convention: {department_id}/{preplan_id}/{filename}
-- RLS keys off the first path segment.

insert into storage.buckets (id, name, public)
values ('preplan-pdfs', 'preplan-pdfs', false),
       ('preplan-photos', 'preplan-photos', false)
on conflict (id) do nothing;

create policy crosslay_storage_read on storage.objects for select to authenticated
  using (bucket_id in ('preplan-pdfs','preplan-photos')
         and (storage.foldername(name))[1] = public.current_department_id()::text);

create policy crosslay_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('preplan-pdfs','preplan-photos')
              and (storage.foldername(name))[1] = public.current_department_id()::text);

create policy crosslay_storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('preplan-pdfs','preplan-photos')
         and (storage.foldername(name))[1] = public.current_department_id()::text
         and public.is_admin());
