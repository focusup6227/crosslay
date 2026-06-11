-- ============================================================
-- Crosslay 0003: shifts + private shift notes
--
-- Departments organize crews into shifts (A/B/C…). Each shift gets a
-- private board (shift_notes) readable and writable only by members of
-- that shift. Admins create shifts and assign members; self-assignment
-- is blocked so "private" actually means private.
-- ============================================================

create table public.shifts (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null default public.current_department_id()
                  references public.departments(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (department_id, name)
);

alter table public.profiles
  add column shift_id uuid references public.shifts(id) on delete set null;

create table public.shift_notes (
  id         uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts(id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 4000),
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);

create index shifts_dept_idx       on public.shifts (department_id);
create index profiles_shift_idx    on public.profiles (shift_id);
create index shift_notes_shift_idx on public.shift_notes (shift_id, created_at desc);

-- caller's shift (security definer mirrors current_department_id)
create or replace function public.current_shift_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select shift_id from public.profiles where id = auth.uid()
$$;

revoke execute on function public.current_shift_id() from public, anon;
grant  execute on function public.current_shift_id() to authenticated;

-- extend the profile guard: shift_id joins role/department_id as
-- admin-only, and an assigned shift must belong to the same department
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role
      or new.department_id is distinct from old.department_id
      or new.shift_id is distinct from old.shift_id) then
    if coalesce(current_setting('crosslay.bypass_profile_guard', true), '') <> 'on'
       and not public.is_admin() then
      raise exception 'Only admins can change role, department, or shift membership';
    end if;
  end if;
  if new.shift_id is not null
     and not exists (select 1 from public.shifts s
                     where s.id = new.shift_id
                       and s.department_id = new.department_id) then
    raise exception 'Shift does not belong to this department';
  end if;
  return new;
end $$;

-- ---------- Row Level Security ----------

alter table public.shifts      enable row level security;
alter table public.shift_notes enable row level security;

-- shifts: every department member sees the list; admins manage
create policy shifts_select on public.shifts for select to authenticated
  using (department_id = public.current_department_id());
create policy shifts_insert on public.shifts for insert to authenticated
  with check (department_id = public.current_department_id() and public.is_admin());
create policy shifts_update on public.shifts for update to authenticated
  using (department_id = public.current_department_id() and public.is_admin())
  with check (department_id = public.current_department_id());
create policy shifts_delete on public.shifts for delete to authenticated
  using (department_id = public.current_department_id() and public.is_admin());

-- shift notes: private to the shift — only its current members, admins
-- included only if they belong to the shift
create policy shift_notes_select on public.shift_notes for select to authenticated
  using (shift_id = public.current_shift_id());
create policy shift_notes_insert on public.shift_notes for insert to authenticated
  with check (shift_id = public.current_shift_id() and created_by = auth.uid());
create policy shift_notes_delete on public.shift_notes for delete to authenticated
  using (created_by = auth.uid() and shift_id = public.current_shift_id());

-- ---------- Data API grants ----------

grant select, insert, update, delete on public.shifts      to authenticated;
grant select, insert, delete         on public.shift_notes to authenticated;
