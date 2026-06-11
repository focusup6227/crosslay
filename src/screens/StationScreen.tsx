import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Department, Role } from '../lib/types'

interface RosterRow {
  id: string
  display_name: string | null
  role: Role
  shift_id: string | null
}

interface StationRow {
  id: string
  name: string
}

interface ShiftRow {
  id: string
  station_id: string
  name: string
}

interface ReviewDueRow {
  id: string
  address: string
  building_name: string | null
  last_reviewed: string | null
}

interface OosHydrantRow {
  id: string
  status_note: string | null
  main_size: string | null
  flow_class: string | null
}

interface DashData {
  department: Department
  roster: RosterRow[]
  stations: StationRow[]
  shifts: ShiftRow[]
  preplanCount: number
  reviewDue: ReviewDueRow[]
  reviewDueCount: number
  hydrantCount: number
  oosHydrants: OosHydrantRow[]
  oosCount: number
}

const REVIEW_CYCLE_DAYS = 365

export function StationScreen() {
  const { profile, refreshProfile } = useAuth()
  const [data, setData] = useState<DashData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async (departmentId: string) => {
    const cutoff = new Date(Date.now() - REVIEW_CYCLE_DAYS * 86400000)
      .toISOString()
      .slice(0, 10)

    const [dept, roster, stations, shifts, planCount, due, hydrantCount, oos] = await Promise.all([
      supabase.from('departments').select('*').eq('id', departmentId).single(),
      supabase.from('profiles').select('id, display_name, role, shift_id').order('display_name'),
      supabase.from('stations').select('id, name').order('name'),
      supabase.from('shifts').select('id, station_id, name').order('name'),
      supabase.from('preplans').select('id', { count: 'exact', head: true }),
      supabase
        .from('preplans')
        .select('id, address, building_name, last_reviewed', { count: 'exact' })
        .or(`last_reviewed.is.null,last_reviewed.lt.${cutoff}`)
        .order('last_reviewed', { ascending: true, nullsFirst: true })
        .limit(5),
      supabase.from('hydrants').select('id', { count: 'exact', head: true }),
      supabase
        .from('hydrants')
        .select('id, status_note, main_size, flow_class', { count: 'exact' })
        .eq('status', 'out_of_service')
        .limit(5),
    ])

    const firstError =
      dept.error ?? roster.error ?? stations.error ?? shifts.error ??
      planCount.error ?? due.error ?? hydrantCount.error ?? oos.error
    if (firstError) throw firstError

    setData({
      department: dept.data as Department,
      roster: (roster.data ?? []) as RosterRow[],
      stations: (stations.data ?? []) as StationRow[],
      shifts: (shifts.data ?? []) as ShiftRow[],
      preplanCount: planCount.count ?? 0,
      reviewDue: (due.data ?? []) as ReviewDueRow[],
      reviewDueCount: due.count ?? 0,
      hydrantCount: hydrantCount.count ?? 0,
      oosHydrants: (oos.data ?? []) as OosHydrantRow[],
      oosCount: oos.count ?? 0,
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!profile?.department_id) return
    await load(profile.department_id)
  }, [profile?.department_id, load])

  useEffect(() => {
    if (!profile?.department_id) return
    setError(null)
    load(profile.department_id).catch((err) => {
      console.error('Failed to load station dashboard', err)
      setError('Could not load the station board — pull to refresh or try again.')
    })
  }, [profile?.department_id, load])

  async function assignShift(memberId: string, shiftId: string | null) {
    setActionError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ shift_id: shiftId })
      .eq('id', memberId)
    if (err) {
      setActionError(err.message)
      return
    }
    if (memberId === profile?.id) await refreshProfile()
    await refresh().catch(() => {})
  }

  if (error) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-oos-400">{error}</p>
      </div>
    )
  }

  if (!data) return <StationSkeleton />

  const {
    department, roster, stations, shifts, preplanCount,
    reviewDue, reviewDueCount, hydrantCount, oosHydrants, oosCount,
  } = data
  const isAdmin = profile?.role === 'admin'
  const inService = hydrantCount - oosCount
  const myShift = shifts.find((s) => s.id === profile?.shift_id) ?? null
  const myStation = myShift ? stations.find((st) => st.id === myShift.station_id) ?? null : null

  const shiftLabel = (shiftId: string | null) => {
    const shift = shifts.find((s) => s.id === shiftId)
    if (!shift) return null
    const station = stations.find((st) => st.id === shift.station_id)
    return station ? `${station.name} · ${shift.name}` : shift.name
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header band — apparatus-bay chevron over the department name */}
      <div
        className="h-2"
        style={{
          backgroundImage:
            'repeating-linear-gradient(-45deg, var(--color-hiviz-400) 0 14px, var(--color-night-900) 14px 28px)',
        }}
        aria-hidden
      />
      <header className="border-b border-night-700 px-4 pb-5 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">Station</p>
        <h2 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide text-ash-100">
          {department.name}
        </h2>
        <p className="mt-1 text-sm text-ash-500">
          {roster.length} {roster.length === 1 ? 'member' : 'members'} · you are{' '}
          <span className={isAdmin ? 'font-semibold text-hiviz-400' : 'text-ash-300'}>
            {profile?.role}
          </span>
        </p>
      </header>

      <div className="space-y-8 px-4 py-6">
        {actionError && (
          <p className="rounded-lg border border-oos-600 bg-night-800 px-4 py-3 text-oos-400">
            {actionError}
          </p>
        )}

        {/* Readiness board — hairline grid, big numerals */}
        <section aria-label="Readiness">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-night-700 bg-night-700 md:grid-cols-4">
            <StatTile label="Preplans" value={preplanCount} />
            <StatTile label="Hydrants" value={hydrantCount} />
            <StatTile
              label="In service"
              value={hydrantCount === 0 ? '—' : `${Math.round((inService / hydrantCount) * 100)}%`}
            />
            <StatTile label="Out of service" value={oosCount} alert={oosCount > 0} />
          </div>
        </section>

        {/* Your shift — gateway to the private board */}
        <section aria-label="Your shift">
          {myShift ? (
            <Link
              to="/shift"
              className="flex items-center justify-between gap-3 rounded-lg border border-night-700 bg-night-800 px-4 py-4 hover:border-hiviz-400"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
                  Your shift
                </p>
                <p className="mt-1 truncate font-display text-xl font-semibold uppercase tracking-wide text-ash-100">
                  {myStation ? `${myStation.name} · ${myShift.name}` : myShift.name}
                </p>
              </div>
              <span className="shrink-0 font-display text-sm font-semibold uppercase tracking-wide text-hiviz-400">
                Open board →
              </span>
            </Link>
          ) : (
            <div className="rounded-lg border border-dashed border-night-600 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
                Your shift
              </p>
              <p className="mt-1 text-ash-300">
                Not assigned yet.{' '}
                {isAdmin
                  ? 'Add a station and shifts below, then assign yourself in the crew list.'
                  : 'Ask your department admin to assign you.'}
              </p>
            </div>
          )}
        </section>

        {/* Stations + shifts */}
        <section aria-label="Stations">
          <SectionHeading>Stations</SectionHeading>
          {stations.length === 0 && !isAdmin && (
            <p className="mt-3 rounded-lg border border-night-700 bg-night-800 px-4 py-4 text-ash-500">
              No stations yet.
            </p>
          )}
          {stations.length > 0 && (
            <ul className="mt-3 space-y-3">
              {stations.map((st) => (
                <StationCard
                  key={st.id}
                  station={st}
                  shifts={shifts.filter((s) => s.station_id === st.id)}
                  roster={roster}
                  isAdmin={isAdmin}
                  onChanged={refresh}
                  onError={setActionError}
                />
              ))}
            </ul>
          )}
          {isAdmin && <AddStationForm onChanged={refresh} onError={setActionError} />}
        </section>

        {/* Out-of-service hydrants — red is reserved for exactly this */}
        <section aria-label="Out-of-service hydrants">
          <SectionHeading>Out of service</SectionHeading>
          {oosHydrants.length === 0 ? (
            <p className="mt-3 rounded-lg border border-night-700 bg-night-800 px-4 py-4 text-ash-500">
              {hydrantCount === 0
                ? 'No hydrants on the board yet — imports land in Phase 4.'
                : 'Every hydrant is in service.'}
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-lg border border-night-700">
              {oosHydrants.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-3 border-b border-night-700 bg-night-800 px-4 py-3 last:border-b-0"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-oos-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ash-100">
                      {h.status_note?.trim() || 'No note'}
                    </p>
                    <p className="text-sm text-ash-500">
                      {[h.main_size && `${h.main_size} main`, h.flow_class && `${h.flow_class} class`]
                        .filter(Boolean)
                        .join(' · ') || 'Hydrant'}
                    </p>
                  </div>
                </li>
              ))}
              {oosCount > oosHydrants.length && (
                <li className="bg-night-800 px-4 py-3 text-sm text-ash-500">
                  +{oosCount - oosHydrants.length} more out of service
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Review queue */}
        <section aria-label="Preplans due for review">
          <SectionHeading>
            Review due{reviewDueCount > 0 && <Count n={reviewDueCount} />}
          </SectionHeading>
          {preplanCount === 0 ? (
            <Link
              to="/add"
              className="mt-3 block rounded-lg border border-dashed border-night-600 px-4 py-5 text-center text-ash-500 hover:border-hiviz-400 hover:text-ash-300"
            >
              No preplans yet — add your first
            </Link>
          ) : reviewDue.length === 0 ? (
            <p className="mt-3 rounded-lg border border-night-700 bg-night-800 px-4 py-4 text-ash-500">
              Every preplan has been reviewed in the last 12 months.
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-lg border border-night-700">
              {reviewDue.map((p) => (
                <li key={p.id} className="border-b border-night-700 bg-night-800 px-4 py-3 last:border-b-0">
                  <p className="truncate font-semibold text-ash-100">
                    {p.building_name?.trim() || p.address}
                  </p>
                  <p className="truncate text-sm text-ash-500">
                    {p.building_name?.trim() ? `${p.address} · ` : ''}
                    {p.last_reviewed
                      ? `last reviewed ${new Date(p.last_reviewed).toLocaleDateString()}`
                      : 'never reviewed'}
                  </p>
                </li>
              ))}
              {reviewDueCount > reviewDue.length && (
                <li className="bg-night-800 px-4 py-3 text-sm text-ash-500">
                  +{reviewDueCount - reviewDue.length} more due
                </li>
              )}
            </ul>
          )}
        </section>

        {/* Crew roster */}
        <section aria-label="Crew">
          <SectionHeading>Crew</SectionHeading>
          <ul className="mt-3 overflow-hidden rounded-lg border border-night-700">
            {roster.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-3 border-b border-night-700 bg-night-800 px-4 py-3 last:border-b-0"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-night-700 font-display text-sm font-semibold uppercase text-ash-300">
                  {initials(m.display_name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ash-100">
                    {m.display_name?.trim() || 'Unnamed'}
                    {m.id === profile?.id && <span className="text-ash-500"> (you)</span>}
                  </p>
                  {!isAdmin && m.shift_id && (
                    <p className="truncate text-sm text-ash-500">{shiftLabel(m.shift_id)}</p>
                  )}
                </div>
                {isAdmin && (
                  <select
                    value={m.shift_id ?? ''}
                    onChange={(e) => assignShift(m.id, e.target.value || null)}
                    aria-label={`Shift for ${m.display_name ?? 'member'}`}
                    className="min-h-10 max-w-44 shrink-0 rounded-md border border-night-600 bg-night-900 px-2 text-sm text-ash-100 focus:border-hiviz-400 focus:outline-none"
                  >
                    <option value="">No shift</option>
                    {stations.map((st) => (
                      <optgroup key={st.id} label={st.name}>
                        {shifts
                          .filter((s) => s.station_id === st.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                )}
                <span
                  className={`shrink-0 font-display text-xs font-semibold uppercase tracking-widest ${
                    m.role === 'admin' ? 'text-hiviz-400' : 'text-ash-500'
                  }`}
                >
                  {m.role}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Invite code */}
        <section aria-label="Invite code">
          <SectionHeading>Invite your crew</SectionHeading>
          <InviteCard code={department.invite_code} />
        </section>
      </div>
    </div>
  )
}

function StationCard({
  station,
  shifts,
  roster,
  isAdmin,
  onChanged,
  onError,
}: {
  station: StationRow
  shifts: ShiftRow[]
  roster: RosterRow[]
  isAdmin: boolean
  onChanged: () => Promise<void>
  onError: (msg: string | null) => void
}) {
  const [shiftName, setShiftName] = useState('')
  const [busy, setBusy] = useState(false)

  async function addShift(e: FormEvent) {
    e.preventDefault()
    if (!shiftName.trim()) return
    setBusy(true)
    onError(null)
    const { error } = await supabase
      .from('shifts')
      .insert({ station_id: station.id, name: shiftName.trim() })
    setBusy(false)
    if (error) {
      onError(
        error.code === '23505'
          ? `${station.name} already has a shift named "${shiftName.trim()}".`
          : error.message,
      )
    } else {
      setShiftName('')
      await onChanged().catch(() => {})
    }
  }

  return (
    <li className="rounded-lg border border-night-700 bg-night-800 px-4 py-4">
      <p className="font-display text-lg font-semibold uppercase tracking-wide text-ash-100">
        {station.name}
      </p>
      {shifts.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {shifts.map((s) => {
            const count = roster.filter((m) => m.shift_id === s.id).length
            return (
              <span key={s.id} className="rounded-md bg-night-700 px-2.5 py-1 text-sm text-ash-300">
                {s.name}
                <span className="text-ash-500"> · {count}</span>
              </span>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-ash-500">No shifts yet.</p>
      )}
      {isAdmin && (
        <form onSubmit={addShift} className="mt-3 flex gap-2">
          <input
            value={shiftName}
            onChange={(e) => setShiftName(e.target.value)}
            placeholder="A Shift"
            aria-label={`New shift name for ${station.name}`}
            className="min-h-10 min-w-0 flex-1 rounded-md border border-night-600 bg-night-900 px-3 text-sm text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !shiftName.trim()}
            className="min-h-10 shrink-0 rounded-md border border-night-600 px-4 font-display text-sm font-semibold uppercase tracking-wide text-ash-300 hover:border-hiviz-400 hover:text-hiviz-400 disabled:opacity-50"
          >
            Add shift
          </button>
        </form>
      )}
    </li>
  )
}

function AddStationForm({
  onChanged,
  onError,
}: {
  onChanged: () => Promise<void>
  onError: (msg: string | null) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    onError(null)
    const { error } = await supabase.from('stations').insert({ name: name.trim() })
    setBusy(false)
    if (error) {
      onError(
        error.code === '23505'
          ? `A station named "${name.trim()}" already exists.`
          : error.message,
      )
    } else {
      setName('')
      await onChanged().catch(() => {})
    }
  }

  return (
    <form onSubmit={add} className="mt-3 flex gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Station 1"
        aria-label="New station name"
        className="min-h-12 min-w-0 flex-1 rounded-md border border-dashed border-night-600 bg-night-900 px-4 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || !name.trim()}
        className="min-h-12 shrink-0 rounded-md bg-hiviz-400 px-5 font-display text-sm font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
      >
        Add station
      </button>
    </form>
  )
}

function StatTile({ label, value, alert = false }: { label: string; value: number | string; alert?: boolean }) {
  return (
    <div className="bg-night-900 px-4 py-5">
      <p
        className={`font-display text-4xl font-semibold tabular-nums ${
          alert ? 'text-oos-400' : 'text-ash-100'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-ash-500">{label}</p>
    </div>
  )
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
      {children}
    </h3>
  )
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded bg-night-700 px-1.5 py-0.5 font-display text-xs font-semibold tracking-normal text-ash-300">
      {n}
    </span>
  )
}

function InviteCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (non-secure context) — leave the code selectable
    }
  }

  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-night-600 bg-night-800 px-4 py-4">
      <code className="min-w-0 flex-1 select-all truncate font-mono text-lg tracking-[0.2em] text-ash-100">
        {code}
      </code>
      <button
        onClick={copy}
        className={`min-h-10 shrink-0 rounded-md px-4 font-display text-sm font-semibold uppercase tracking-wide ${
          copied ? 'bg-night-700 text-hiviz-400' : 'bg-hiviz-400 text-night-950'
        }`}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function StationSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl animate-pulse">
      <div className="h-2 bg-night-700" />
      <div className="border-b border-night-700 px-4 pb-5 pt-6">
        <div className="h-3 w-16 rounded bg-night-700" />
        <div className="mt-3 h-8 w-2/3 rounded bg-night-700" />
        <div className="mt-3 h-3 w-40 rounded bg-night-800" />
      </div>
      <div className="space-y-8 px-4 py-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-night-700 bg-night-700 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-night-900" />
          ))}
        </div>
        <div className="h-28 rounded-lg border border-night-700 bg-night-800" />
        <div className="h-28 rounded-lg border border-night-700 bg-night-800" />
      </div>
    </div>
  )
}

function initials(name: string | null): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/)
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
