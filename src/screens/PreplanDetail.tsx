import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { PhotoUploader } from '../components/PhotoUploader'

// pdfjs is heavy — load it only when a preplan detail with documents is opened,
// keeping it out of the Map/Search/Add bundles.
const PdfViewer = lazy(() =>
  import('../components/PdfViewer').then((m) => ({ default: m.PdfViewer })),
)
import {
  addDocument,
  deleteDocument,
  deletePhoto,
  deletePreplan,
  getPreplan,
  listDocuments,
  listPhotos,
} from '../lib/preplans'
import { lngLatFromGeom } from '../lib/geo'
import {
  PDF_BUCKET,
  PHOTO_BUCKET,
  removeFromBucket,
  signedUrl,
  storagePath,
  uploadToBucket,
} from '../lib/storage'
import { pushRecent } from '../lib/recents'
import type { Preplan, PreplanDocument, PreplanPhoto } from '../lib/types'

interface SignedDoc extends PreplanDocument {
  url: string | null
}
interface SignedPhoto extends PreplanPhoto {
  url: string | null
}

export function PreplanDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [preplan, setPreplan] = useState<Preplan | null>(null)
  const [docs, setDocs] = useState<SignedDoc[]>([])
  const [photos, setPhotos] = useState<SignedPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    const [plan, documents, pics] = await Promise.all([
      getPreplan(id),
      listDocuments(id),
      listPhotos(id),
    ])
    if (!plan) {
      setError('Preplan not found.')
      return
    }
    setPreplan(plan)
    setDocs(
      await Promise.all(
        documents.map(async (d) => ({ ...d, url: await signedUrl(PDF_BUCKET, d.file_url) })),
      ),
    )
    setPhotos(
      await Promise.all(
        pics.map(async (p) => ({ ...p, url: await signedUrl(PHOTO_BUCKET, p.photo_url) })),
      ),
    )
    pushRecent({ id: plan.id, address: plan.address, building_name: plan.building_name })
  }, [id])

  useEffect(() => {
    setLoading(true)
    setError(null)
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load preplan'))
      .finally(() => setLoading(false))
  }, [load])

  async function onDeletePreplan() {
    if (!preplan) return
    if (!confirm('Delete this preplan and all its photos and documents? This cannot be undone.'))
      return
    try {
      await deletePreplan(preplan.id)
      navigate('/search')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function onAddDocuments(files: FileList | null) {
    if (!files || !preplan || !profile?.department_id) return
    try {
      const start = docs.length
      let i = 0
      for (const file of Array.from(files)) {
        const path = storagePath(profile.department_id, preplan.id, file.name)
        await uploadToBucket(PDF_BUCKET, path, file, file.type || 'application/pdf')
        await addDocument(preplan.id, path, file.name, start + i++)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Document upload failed')
    }
  }

  async function onDeleteDoc(doc: SignedDoc) {
    if (!confirm('Delete this document?')) return
    try {
      await deleteDocument(doc.id)
      await removeFromBucket(PDF_BUCKET, doc.file_url).catch(() => {})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  async function onDeletePhoto(photo: SignedPhoto) {
    if (!confirm('Delete this photo?')) return
    try {
      await deletePhoto(photo.id)
      await removeFromBucket(PHOTO_BUCKET, photo.photo_url).catch(() => {})
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  if (loading) return <p className="px-6 py-10 text-center text-ash-500">Loading…</p>
  if (error && !preplan)
    return (
      <div className="px-6 py-10 text-center">
        <p className="text-oos-400">{error}</p>
        <Link to="/search" className="mt-4 inline-block text-hiviz-400 underline">
          Back to search
        </Link>
      </div>
    )
  if (!preplan) return null

  const point = lngLatFromGeom(preplan.geom)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold uppercase leading-tight tracking-wide text-ash-100">
            {preplan.building_name || preplan.address}
          </h1>
          {preplan.building_name && <p className="mt-1 text-lg text-ash-300">{preplan.address}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            {preplan.occupancy_type && (
              <span className="rounded bg-night-700 px-2 py-1 font-semibold uppercase tracking-wide text-ash-300">
                {preplan.occupancy_type}
              </span>
            )}
            {preplan.last_reviewed && (
              <span className="text-ash-500">Reviewed {preplan.last_reviewed}</span>
            )}
          </div>
        </div>
        <Link
          to={`/preplan/${preplan.id}/edit`}
          className="shrink-0 rounded-md border border-night-600 px-4 py-2.5 font-semibold text-hiviz-400"
        >
          Edit
        </Link>
      </div>

      {error && <p className="mt-4 text-oos-400">{error}</p>}

      {/* Hazards — most safety-critical, render first and loud */}
      {preplan.hazards && (
        <section className="mt-6 rounded-md border border-oos-600 bg-night-800 p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-widest text-oos-400">
            Hazards
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-lg text-ash-100">{preplan.hazards}</p>
        </section>
      )}

      {/* Contacts — tap to call */}
      {preplan.contacts.length > 0 && (
        <Section title="Contacts">
          <ul className="space-y-2">
            {preplan.contacts.map((c, i) => (
              <li key={i}>
                <a
                  href={c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : undefined}
                  className={`flex min-h-14 items-center justify-between rounded-md border border-night-700 bg-night-800 px-4 ${
                    c.phone ? 'hover:bg-night-700' : 'pointer-events-none'
                  }`}
                >
                  <span>
                    <span className="font-semibold text-ash-100">{c.name || 'Contact'}</span>
                    {c.role && <span className="ml-2 text-sm text-ash-500">{c.role}</span>}
                  </span>
                  {c.phone && <span className="font-semibold text-hiviz-400">{c.phone}</span>}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Notes */}
      {preplan.notes && (
        <Section title="Notes">
          <p className="whitespace-pre-wrap text-lg text-ash-100">{preplan.notes}</p>
        </Section>
      )}

      {/* Location */}
      {point && (
        <Section title="Location">
          <p className="text-ash-300">
            {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          </p>
          <a
            href={`https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=18/${point.lat}/${point.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-hiviz-400 underline"
          >
            Open in map
          </a>
        </Section>
      )}

      {/* Photos */}
      <Section title="Photos">
        {photos.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li key={p.id} className="overflow-hidden rounded-md border border-night-700 bg-night-800">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <img src={p.url} alt={p.caption ?? ''} className="aspect-square w-full object-cover" />
                  </a>
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center text-ash-500">
                    unavailable
                  </div>
                )}
                <div className="flex items-start justify-between gap-2 p-2">
                  <p className="text-sm text-ash-300">{p.caption}</p>
                  {isAdmin && (
                    <button
                      onClick={() => onDeletePhoto(p)}
                      className="shrink-0 text-xs font-semibold text-oos-400"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-ash-500">No photos yet.</p>
        )}
        {profile?.department_id && (
          <div className="mt-3">
            <PhotoUploader
              preplanId={preplan.id}
              departmentId={profile.department_id}
              onUploaded={load}
            />
          </div>
        )}
      </Section>

      {/* Documents */}
      <Section title="Documents">
        {docs.length === 0 && <p className="mb-3 text-ash-500">No documents yet.</p>}
        <div className="space-y-5">
          {docs.map((d) => (
            <div key={d.id}>
              {d.url ? (
                <Suspense fallback={<div className="p-4 text-ash-500">Loading viewer…</div>}>
                  <PdfViewer url={d.url} title={d.title || 'Document'} />
                </Suspense>
              ) : (
                <p className="text-ash-500">{d.title || 'Document'} — unavailable</p>
              )}
              {isAdmin && (
                <button
                  onClick={() => onDeleteDoc(d)}
                  className="mt-1 text-sm font-semibold text-oos-400"
                >
                  Delete document
                </button>
              )}
            </div>
          ))}
        </div>
        <label className="mt-3 inline-block min-h-11 cursor-pointer rounded-md border border-night-600 px-4 py-2.5 font-semibold text-hiviz-400">
          + Add document
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              onAddDocuments(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </Section>

      {/* Admin delete */}
      {isAdmin && (
        <div className="mt-10 border-t border-night-700 pt-6">
          <button
            onClick={onDeletePreplan}
            className="min-h-12 rounded-md border border-oos-600 px-4 font-semibold text-oos-400"
          >
            Delete preplan
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold uppercase tracking-wide text-ash-300">
        {title}
      </h2>
      {children}
    </section>
  )
}
