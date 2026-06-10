import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchPreplans, type PreplanSearchRow } from '../lib/preplans'
import { getRecents, type RecentPreplan } from '../lib/recents'

export function SearchScreen() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PreplanSearchRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recents, setRecents] = useState<RecentPreplan[]>([])
  const reqId = useRef(0)

  useEffect(() => {
    setRecents(getRecents())
  }, [])

  useEffect(() => {
    const q = query.trim()
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      searchPreplans(q)
        .then((rows) => {
          if (id === reqId.current) setResults(rows)
        })
        .catch((err) => {
          if (id === reqId.current) setError(err instanceof Error ? err.message : 'Search failed')
        })
        .finally(() => {
          if (id === reqId.current) setLoading(false)
        })
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const showRecents = query.trim() === '' && recents.length > 0

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search address or building name"
        className="min-h-14 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
      />

      {showRecents && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-ash-500">
            Recently viewed
          </h3>
          <ul className="mt-2 divide-y divide-night-700 overflow-hidden rounded-md border border-night-700">
            {recents.map((r) => (
              <ResultRow
                key={r.id}
                id={r.id}
                address={r.address}
                building_name={r.building_name}
                occupancy_type={null}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        {error && <p className="text-oos-400">{error}</p>}
        {!error && !loading && results.length === 0 && (
          <p className="text-ash-500">
            {query.trim()
              ? 'No matching preplans.'
              : recents.length === 0
                ? 'Search your department’s preplans, or add your first from the Add tab.'
                : 'Start typing to search all preplans.'}
          </p>
        )}
        {results.length > 0 && (
          <ul className="divide-y divide-night-700 overflow-hidden rounded-md border border-night-700">
            {results.map((r) => (
              <ResultRow key={r.id} {...r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ResultRow({
  id,
  address,
  building_name,
  occupancy_type,
}: {
  id: string
  address: string
  building_name: string | null
  occupancy_type: string | null
}) {
  return (
    <li>
      <Link
        to={`/preplan/${id}`}
        className="flex min-h-16 flex-col justify-center gap-0.5 bg-night-800 px-4 py-3 hover:bg-night-700"
      >
        <span className="font-semibold text-ash-100">{building_name || address}</span>
        <span className="text-sm text-ash-500">
          {building_name ? address : occupancy_type || 'Preplan'}
        </span>
      </Link>
    </li>
  )
}
