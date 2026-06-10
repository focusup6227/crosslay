import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PreplanForm } from '../components/PreplanForm'
import { getPreplan } from '../lib/preplans'
import type { Preplan } from '../lib/types'

export function EditScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [preplan, setPreplan] = useState<Preplan | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    getPreplan(id)
      .then((p) => {
        if (cancelled) return
        if (!p) setError('Preplan not found.')
        else setPreplan(p)
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Load failed'))
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return <p className="px-6 py-10 text-center text-oos-400">{error}</p>
  }
  if (!preplan) {
    return <p className="px-6 py-10 text-center text-ash-500">Loading…</p>
  }

  return (
    <PreplanForm
      mode="edit"
      initial={preplan}
      onSaved={(p) => navigate(`/preplan/${p.id}`)}
      onCancel={() => navigate(`/preplan/${preplan.id}`)}
    />
  )
}
