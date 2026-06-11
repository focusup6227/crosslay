import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import type { Shift, ShiftNote } from '../lib/types'

interface MemberRow {
  id: string
  display_name: string | null
}

interface ShiftWithStation extends Shift {
  station: { name: string } | null
}

export function ShiftScreen() {
  const { profile } = useAuth()
  const shiftId = profile?.shift_id ?? null

  const [shift, setShift] = useState<ShiftWithStation | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [notes, setNotes] = useState<ShiftNote[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    if (!shiftId) return
    const [s, m, n] = await Promise.all([
      supabase.from('shifts').select('*, station:stations(name)').eq('id', shiftId).single(),
      supabase.from('profiles').select('id, display_name').eq('shift_id', shiftId).order('display_name'),
      supabase
        .from('shift_notes')
        .select('*')
        .eq('shift_id', shiftId)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    const firstError = s.error ?? m.error ?? n.error
    if (firstError) throw firstError
    setShift(s.data as ShiftWithStation)
    setMembers((m.data ?? []) as MemberRow[])
    setNotes((n.data ?? []) as ShiftNote[])
  }, [shiftId])

  useEffect(() => {
    if (!shiftId) {
      setLoaded(true)
      return
    }
    setError(null)
    load()
      .catch((err) => {
        console.error('Failed to load shift board', err)
        setError('Could not load the shift board — try again.')
      })
      .finally(() => setLoaded(true))
  }, [shiftId, load])

  async function post(e: FormEvent) {
    e.preventDefault()
    if (!shiftId || !body.trim()) return
    setPosting(true)
    const { error: postErr } = await supabase
      .from('shift_notes')
      .insert({ shift_id: shiftId, body: body.trim() })
    setPosting(false)
    if (postErr) {
      setError(postErr.message)
    } else {
      setBody('')
      setError(null)
      await load().catch(() => {})
    }
  }

  async function removeNote(id: string) {
    const { error: delErr } = await supabase.from('shift_notes').delete().eq('id', id)
    if (delErr) {
      setError(delErr.message)
    } else {
      setNotes((prev) => prev.filter((n) => n.id !== id))
    }
  }

  if (!shiftId) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ash-300">
          No shift yet
        </h2>
        {profile?.role === 'admin' ? (
          <p className="mt-2 max-w-sm text-ash-500">
            Create shifts and assign your crew on the{' '}
            <Link to="/station" className="text-hiviz-400 underline">
              Station
            </Link>{' '}
            board.
          </p>
        ) : (
          <p className="mt-2 max-w-sm text-ash-500">
            Ask your department admin to assign you to a shift.
          </p>
        )}
      </div>
    )
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-3xl animate-pulse px-4 py-6">
        <div className="h-3 w-24 rounded bg-night-700" />
        <div className="mt-3 h-8 w-1/2 rounded bg-night-700" />
        <div className="mt-8 h-28 rounded-lg border border-night-700 bg-night-800" />
        <div className="mt-4 h-20 rounded-lg border border-night-700 bg-night-800" />
      </div>
    )
  }

  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.display_name?.trim() || 'Former shift member'

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="border-b border-night-700 px-4 pb-5 pt-6">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
          Shift board
        </p>
        <h2 className="mt-1 font-display text-3xl font-semibold uppercase tracking-wide text-ash-100">
          {shift?.station ? `${shift.station.name} · ${shift.name}` : shift?.name ?? 'Shift'}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {members.map((m) => (
            <span
              key={m.id}
              className="rounded-md bg-night-800 px-2.5 py-1 text-sm text-ash-300"
            >
              {m.display_name?.trim() || 'Unnamed'}
              {m.id === profile?.id && <span className="text-ash-500"> (you)</span>}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs uppercase tracking-widest text-ash-500">
          Visible only to {shift?.name ?? 'this shift'}
        </p>
      </header>

      <div className="space-y-6 px-4 py-6">
        <form onSubmit={post}>
          <label htmlFor="note" className="sr-only">
            Post a note to your shift
          </label>
          <textarea
            id="note"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Leave a note for ${shift?.name ?? 'your shift'}…`}
            className="w-full rounded-lg border border-night-600 bg-night-800 px-4 py-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
          />
          {error && <p className="mt-2 text-sm text-oos-400">{error}</p>}
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="mt-2 min-h-12 w-full rounded-md bg-hiviz-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50 md:w-auto md:px-8"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </form>

        {notes.length === 0 ? (
          <p className="rounded-lg border border-dashed border-night-600 px-4 py-6 text-center text-ash-500">
            Nothing on the board yet. First note sets the tone.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-night-700 bg-night-800 px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-ash-300">
                    {nameOf(n.created_by)}
                    {n.created_by === profile?.id && (
                      <span className="font-normal text-ash-500"> (you)</span>
                    )}
                  </p>
                  <div className="flex shrink-0 items-center gap-3">
                    <time className="text-xs text-ash-500" dateTime={n.created_at}>
                      {formatWhen(n.created_at)}
                    </time>
                    {n.created_by === profile?.id && (
                      <button
                        onClick={() => removeNote(n.id)}
                        className="text-xs uppercase tracking-widest text-ash-500 hover:text-oos-400"
                        aria-label="Delete note"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-ash-100">{n.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
