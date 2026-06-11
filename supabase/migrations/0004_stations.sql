-- ============================================================
-- Crosslay 0004: stations; shifts move under stations
--
-- Correct hierarchy: department -> stations -> shifts (A/B/C…).
-- 0003 hung shifts directly off departments; the table was still
-- empty, so this restructures in place. Shift notes are unchanged
-- (still keyed by shift_id / current_shift_id()).
-- ============================================================

create table public.stations (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid not null default public.current_department_id()
                  references public.departments(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (department_id, name)
);

create index stations_dept_idx on public.stations (department_id);

-- re-parent shifts: department_id -> station_id (table is empty)
drop policy shifts_select on public.shifts;
drop policy shifts_insert on public.shifts;
drop policy shifts_update on public.shifts;
drop policy shifts_delete on public.shifts;

alter table public.shifts drop column department_id;
alter table public.shifts add column station_id uuid not null
  references public.stations(id) on delete cascade;
alter table public.shifts add constraint shifts_station_name_key unique (station_id, name);

create index shifts_station_idx on public.shifts (station_id);

-- an assigned shift must belong to a station in the member's department
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
     and not exists (select 1
                       from public.shifts s
                       join public.stations st on st.id = s.station_id
                      where s.id = new.shift_id
                        and st.department_id = new.department_id) then
    raise exception 'Shift does not belong to this department';
  end if;
  return new;
end $$;

-- ---------- Row Level Security ----------

alter table public.stations enable row level security;

create policy stations_select on public.stations for select to authenticated
  using (department_id = public.current_department_id());
create policy stations_insert on public.stations for insert to authenticated
  with check (department_id = public.current_department_id() and public.is_admin());
create policy stations_update on public.stations for update to authenticated
  using (department_id = public.current_department_id() and public.is_admin())
  with check (department_id = public.current_department_id());
create policy stations_delete on public.stations for delete to authenticated
  using (department_id = public.current_department_id() and public.is_admin());

create policy shifts_select on public.shifts for select to authenticated
  using (exists (select 1 from public.stations st
                 where st.id = station_id
                   and st.department_id = public.current_department_id()));
create policy shifts_insert on public.shifts for insert to authenticated
  with check (public.is_admin()
              and exists (select 1 from public.stations st
                          where st.id = station_id
                            and st.department_id = public.current_department_id()));
create policy shifts_update on public.shifts for update to authenticated
  using (public.is_admin()
         and exists (select 1 from public.stations st
                     where st.id = station_id
                       and st.department_id = public.current_department_id()))
  with check (exists (select 1 from public.stations st
                      where st.id = station_id
                        and st.department_id = public.current_department_id()));
create policy shifts_delete on public.shifts for delete to authenticated
  using (public.is_admin()
         and exists (select 1 from public.stations st
                     where st.id = station_id
                       and st.department_id = public.current_department_id()));

-- ---------- Data API grants ----------

grant select, insert, update, delete on public.stations to authenticated;
