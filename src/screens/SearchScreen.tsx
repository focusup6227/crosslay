import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getRecents } from '../lib/recents'
import type { RecentPreplan } from '../lib/recents'

interface ResultRow {
  id: string
  address: string
  building_name: string | null
  occupancy_type: string | null
}

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultRow[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recents] = useState<RecentPreplan[]>(getRecents)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    timer.current = setTimeout(async () => {
      const escaped = q.replace(/[%_]/g, '\\$&')
      const { data, error: err } = await supabase
        .from('preplans')
        .select('id, address, building_name, occupancy_type')
        .or(`address.ilike.%${escaped}%,building_name.ilike.%${escaped}%`)
        .order('updated_at', { ascending: false })
        .limit(15)
      setSearching(false)
      if (err) {
        console.error('Search failed', err)
        setError('Search failed — try again.')
      } else {
        setError(null)
        setResults((data ?? []) as ResultRow[])
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <label htmlFor="search" className="sr-only">
        Search preplans
      </label>
      <input
        id="search"
        type="search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Address or building name…"
        autoComplete="off"
        className="min-h-14 w-full rounded-lg border border-night-600 bg-night-800 px-4 text-lg text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
      />

      {error && <p className="mt-3 text-oos-400">{error}</p>}

      {results !== null ? (
        <div className="mt-4">
          {searching && <p className="text-sm text-ash-500">Searching…</p>}
          {!searching && results.length === 0 && (
            <p className="rounded-lg border border-dashed border-night-600 px-4 py-6 text-center text-ash-500">
              No preplans match “{query.trim()}”.{' '}
              <Link to="/add" className="text-hiviz-400 underline">
                Create one
              </Link>
              ?
            </p>
          )}
          <ul className="overflow-hidden rounded-lg border border-night-700 empty:border-0">
            {results.map((r) => (
              <li key={r.id} className="border-b border-night-700 last:border-b-0">
                <Link to={`/preplan/${r.id}`} className="block bg-night-800 px-4 py-3 hover:bg-night-700">
                  <p className="truncate font-semibold text-ash-100">
                    {r.building_name?.trim() || r.address}
                  </p>
                  <p className="truncate text-sm text-ash-500">
                    {r.building_name?.trim() ? r.address : ''}
                    {r.building_name?.trim() && r.occupancy_type?.trim() ? ' · ' : ''}
                    {r.occupancy_type?.trim() ?? ''}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
            Recently viewed
          </h3>
          {recents.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-night-600 px-4 py-6 text-center text-ash-500">
              Preplans you open will show up here for quick access en route.
            </p>
          ) : (
            <ul className="mt-3 overflow-hidden rounded-lg border border-night-700">
              {recents.map((r) => (
                <li key={r.id} className="border-b border-night-700 last:border-b-0">
                  <Link to={`/preplan/${r.id}`} className="block bg-night-800 px-4 py-3 hover:bg-night-700">
                    <p className="truncate font-semibold text-ash-100">{r.title}</p>
                    {r.title !== r.address && (
                      <p className="truncate text-sm text-ash-500">{r.address}</p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
