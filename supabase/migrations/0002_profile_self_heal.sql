-- ============================================================
-- Crosslay 0002: profile self-healing
--
-- A user whose auth.users row predates the profiles table (or whose
-- profile row is ever lost) got stuck on onboarding: the RPCs' profile
-- UPDATE matched zero rows and silently did nothing. Backfill missing
-- rows, make the onboarding RPCs upsert instead of update, and add an
-- ensure_profile() RPC the client calls when it finds no profile row.
-- ============================================================

-- backfill profiles for any existing auth users missing one
insert into public.profiles (id, display_name)
select u.id, u.raw_user_meta_data->>'display_name'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- self-heal RPC: creates the caller's profile row if missing, returns it
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  prof public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, display_name)
  select u.id, u.raw_user_meta_data->>'display_name'
    from auth.users u
   where u.id = auth.uid()
  on conflict (id) do nothing;

  select * into prof from public.profiles where id = auth.uid();
  return prof;
end $$;

revoke execute on function public.ensure_profile() from public, anon;
grant  execute on function public.ensure_profile() to authenticated;

-- onboarding RPCs: upsert the profile row so a missing row can't no-op

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
  insert into public.profiles (id, department_id, role)
  values (auth.uid(), dept.id, 'admin')
  on conflict (id) do update
    set department_id = excluded.department_id, role = excluded.role;

  return dept;
end $$;

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
  insert into public.profiles (id, department_id, role)
  values (auth.uid(), dept.id, 'member')
  on conflict (id) do update
    set department_id = excluded.department_id, role = excluded.role;

  return dept;
end $$;
