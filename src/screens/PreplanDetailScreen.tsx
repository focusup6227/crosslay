import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { compressImage } from '../lib/image'
import { storagePath, uploadFile, signedUrls } from '../lib/storage'
import { pushRecent } from '../lib/recents'
import type { Contact, Preplan, PreplanDocument, PreplanPhoto } from '../lib/types'

interface PlanWithCoords extends Preplan {
  lat: number | null
  lng: number | null
}

interface PendingPhoto {
  file: File
  caption: string
  preview: string
}

export function PreplanDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [plan, setPlan] = useState<PlanWithCoords | null>(null)
  const [docs, setDocs] = useState<PreplanDocument[]>([])
  const [photos, setPhotos] = useState<PreplanPhoto[]>([])
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [openDoc, setOpenDoc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const [p, d, ph] = await Promise.all([
      supabase.from('preplans').select('*, lat, lng').eq('id', id).single(),
      supabase.from('preplan_documents').select('*').eq('preplan_id', id).order('sort_order'),
      supabase
        .from('preplan_photos')
        .select('*')
        .eq('preplan_id', id)
        .order('created_at', { ascending: false }),
    ])
    const firstError = p.error ?? d.error ?? ph.error
    if (firstError) throw firstError

    const planRow = p.data as PlanWithCoords
    const docRows = (d.data ?? []) as PreplanDocument[]
    const photoRows = (ph.data ?? []) as PreplanPhoto[]

    const [pdfUrls, photoUrls] = await Promise.all([
      signedUrls('preplan-pdfs', docRows.map((x) => x.file_url)),
      signedUrls('preplan-photos', photoRows.map((x) => x.photo_url)),
    ])
    const merged = new Map([...pdfUrls, ...photoUrls])

    setPlan(planRow)
    setDocs(docRows)
    setPhotos(photoRows)
    setUrls(merged)
    pushRecent({
      id: planRow.id,
      title: planRow.building_name?.trim() || planRow.address,
      address: planRow.address,
    })
  }, [id])

  useEffect(() => {
    setError(null)
    load()
      .catch((err) => {
        console.error('Failed to load preplan', err)
        setError('Could not load this preplan.')
      })
      .finally(() => setLoaded(true))
  }, [load])

  function pickPhotos(files: FileList | null) {
    if (!files) return
    const picked = Array.from(files).map((file) => ({
      file,
      caption: '',
      preview: URL.createObjectURL(file),
    }))
    setPending((prev) => [...prev, ...picked])
  }

  async function uploadPhotos() {
    if (!plan || !profile?.department_id || pending.some((p) => !p.caption.trim())) return
    setUploading(true)
    setError(null)
    try {
      for (const item of pending) {
        const blob = await compressImage(item.file)
        const path = storagePath(
          profile.department_id,
          plan.id,
          item.file.name.replace(/\.[^.]+$/, '') + '.jpg',
        )
        await uploadFile('preplan-photos', path, blob, 'image/jpeg')
        const { error: err } = await supabase.from('preplan_photos').insert({
          preplan_id: plan.id,
          photo_url: path,
          caption: item.caption.trim(),
        })
        if (err) throw err
      }
      pending.forEach((p) => URL.revokeObjectURL(p.preview))
      setPending([])
      await load()
    } catch (err) {
      console.error('Photo upload failed', err)
      setError(err instanceof Error ? err.message : 'Photo upload failed — try again')
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto(photo: PreplanPhoto) {
    setError(null)
    await supabase.storage.from('preplan-photos').remove([photo.photo_url])
    const { error: err } = await supabase.from('preplan_photos').delete().eq('id', photo.id)
    if (err) setError(err.message)
    else setPhotos((prev) => prev.filter((p) => p.id !== photo.id))
  }

  async function markReviewed() {
    if (!plan) return
    const today = new Date().toISOString().slice(0, 10)
    const { error: err } = await supabase
      .from('preplans')
      .update({ last_reviewed: today })
      .eq('id', plan.id)
    if (err) setError(err.message)
    else setPlan({ ...plan, last_reviewed: today })
  }

  async function deletePlan() {
    if (!plan) return
    if (!window.confirm(`Delete the preplan for ${plan.address}? This cannot be undone.`)) return
    const { error: err } = await supabase.from('preplans').delete().eq('id', plan.id)
    if (err) setError(err.message)
    else navigate('/search', { replace: true })
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-3xl animate-pulse px-4 py-6">
        <div className="h-8 w-2/3 rounded bg-night-700" />
        <div className="mt-3 h-4 w-1/2 rounded bg-night-800" />
        <div className="mt-8 h-32 rounded-lg bg-night-800" />
      </div>
    )
  }

  if (!plan) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
        <p className="text-oos-400">{error ?? 'Preplan not found.'}</p>
      </div>
    )
  }

  const contacts = (plan.contacts ?? []) as Contact[]

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="border-b border-night-700 px-4 pb-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {plan.building_name?.trim() && (
              <h2 className="font-display text-3xl font-semibold uppercase tracking-wide text-ash-100">
                {plan.building_name}
              </h2>
            )}
            <p
              className={
                plan.building_name?.trim()
                  ? 'mt-1 text-lg text-ash-300'
                  : 'font-display text-3xl font-semibold uppercase tracking-wide text-ash-100'
              }
            >
              {plan.address}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ash-500">
              {plan.occupancy_type?.trim() && (
                <span className="rounded-md bg-night-700 px-2.5 py-1 text-ash-300">
                  {plan.occupancy_type}
                </span>
              )}
              <span>
                {plan.last_reviewed
                  ? `Reviewed ${new Date(plan.last_reviewed).toLocaleDateString()}`
                  : 'Never reviewed'}
              </span>
            </div>
          </div>
          <Link
            to={`/preplan/${plan.id}/edit`}
            className="min-h-10 shrink-0 rounded-md border border-night-600 px-4 py-2 font-display text-sm font-semibold uppercase tracking-wide text-ash-300 hover:border-hiviz-400 hover:text-hiviz-400"
          >
            Edit
          </Link>
        </div>
      </header>

      <div className="space-y-8 px-4 py-6">
        {error && (
          <p className="rounded-lg border border-oos-600 bg-night-800 px-4 py-3 text-oos-400">
            {error}
          </p>
        )}

        {/* Hazards first — it's what kills people */}
        {plan.hazards?.trim() && (
          <section aria-label="Hazards" className="rounded-lg border-l-4 border-hiviz-400 bg-night-800 px-4 py-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-hiviz-400">
              Hazards
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-lg text-ash-100">{plan.hazards}</p>
          </section>
        )}

        {contacts.length > 0 && (
          <section aria-label="Contacts">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
              Contacts
            </h3>
            <ul className="mt-3 space-y-2">
              {contacts.map((c, i) => (
                <li key={i}>
                  <a
                    href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                    className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-night-700 bg-night-800 px-4 hover:border-hiviz-400"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ash-100">{c.name}</span>
                      {c.role && <span className="block truncate text-sm text-ash-500">{c.role}</span>}
                    </span>
                    <span className="shrink-0 font-display text-lg font-semibold text-hiviz-400">
                      {c.phone}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan.notes?.trim() && (
          <section aria-label="Notes">
            <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">Notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-ash-100">{plan.notes}</p>
          </section>
        )}

        {/* Documents */}
        <section aria-label="Preplan documents">
          <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">
            Documents
          </h3>
          {docs.length === 0 ? (
            <p className="mt-3 text-ash-500">
              No PDFs attached —{' '}
              <Link to={`/preplan/${plan.id}/edit`} className="text-hiviz-400 underline">
                add one
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {docs.map((d) => {
                const url = urls.get(d.file_url)
                const open = openDoc === d.id
                return (
                  <li key={d.id} className="overflow-hidden rounded-lg border border-night-700">
                    <div className="flex items-center justify-between gap-3 bg-night-800 px-4 py-3">
                      <button
                        onClick={() => setOpenDoc(open ? null : d.id)}
                        className="min-w-0 flex-1 truncate text-left font-semibold text-ash-100 hover:text-hiviz-400"
                      >
                        {d.title ?? 'Preplan PDF'}
                      </button>
                      {url && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 font-display text-sm font-semibold uppercase tracking-wide text-hiviz-400"
                        >
                          Open PDF
                        </a>
                      )}
                    </div>
                    {open && url && (
                      <object data={url} type="application/pdf" className="h-[70dvh] w-full bg-night-950">
                        <p className="px-4 py-6 text-center text-ash-500">
                          This browser can’t display PDFs inline —{' '}
                          <a href={url} target="_blank" rel="noreferrer" className="text-hiviz-400 underline">
                            open the PDF
                          </a>
                          .
                        </p>
                      </object>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* Photos */}
        <section aria-label="Photos">
          <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-ash-500">Photos</h3>

          {photos.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
              {photos.map((p) => {
                const url = urls.get(p.photo_url)
                return (
                  <li key={p.id} className="overflow-hidden rounded-lg border border-night-700 bg-night-800">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        <img
                          src={url}
                          alt={p.caption ?? 'Preplan photo'}
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                        />
                      </a>
                    ) : (
                      <div className="aspect-square w-full bg-night-700" />
                    )}
                    <div className="flex items-start justify-between gap-2 px-3 py-2">
                      <p className="min-w-0 text-sm text-ash-300">{p.caption}</p>
                      {isAdmin && (
                        <button
                          onClick={() => removePhoto(p)}
                          className="shrink-0 text-xs uppercase tracking-widest text-ash-500 hover:text-oos-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Upload flow: pick → caption each (required) → upload */}
          <div className="mt-4">
            <label className="block">
              <span className="sr-only">Add photos</span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  pickPhotos(e.target.files)
                  e.target.value = ''
                }}
                className="block w-full text-sm text-ash-300 file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-night-700 file:px-4 file:font-display file:text-sm file:font-semibold file:uppercase file:tracking-wide file:text-ash-300"
              />
            </label>

            {pending.length > 0 && (
              <div className="mt-3 space-y-3">
                {pending.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-night-700 bg-night-800 p-3">
                    <img src={p.preview} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                    <input
                      value={p.caption}
                      onChange={(e) =>
                        setPending((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)),
                        )
                      }
                      placeholder="Where is this? e.g. Alarm panel — electrical room off lobby"
                      className="min-h-12 min-w-0 flex-1 rounded-md border border-night-600 bg-night-900 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        URL.revokeObjectURL(p.preview)
                        setPending((prev) => prev.filter((_, j) => j !== i))
                      }}
                      aria-label="Remove photo"
                      className="shrink-0 px-2 text-ash-500 hover:text-oos-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {pending.some((p) => !p.caption.trim()) && (
                  <p className="text-sm text-ash-500">
                    Every photo needs a short location caption before upload.
                  </p>
                )}
                <button
                  onClick={uploadPhotos}
                  disabled={uploading || pending.some((p) => !p.caption.trim())}
                  className="min-h-12 w-full rounded-md bg-hiviz-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
                >
                  {uploading
                    ? 'Uploading…'
                    : `Upload ${pending.length} photo${pending.length > 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Review + admin actions */}
        <section aria-label="Actions" className="space-y-3 border-t border-night-700 pt-6">
          <button
            onClick={markReviewed}
            className="min-h-12 w-full rounded-md border border-night-600 px-4 font-display text-lg font-semibold uppercase tracking-wide text-ash-300 hover:border-hiviz-400 hover:text-hiviz-400"
          >
            Mark reviewed today
          </button>
          {isAdmin && (
            <button
              onClick={deletePlan}
              className="min-h-12 w-full rounded-md border border-night-700 px-4 font-display text-sm font-semibold uppercase tracking-wide text-ash-500 hover:border-oos-600 hover:text-oos-400"
            >
              Delete preplan
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
