import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { geocode } from '../lib/geocode'
import type { GeocodeResult } from '../lib/geocode'
import { storagePath, uploadFile } from '../lib/storage'
import type { Contact, PreplanDocument } from '../lib/types'

// maplibre-gl is heavy; load it only when a pin actually renders
const PinMap = lazy(() =>
  import('../components/PinMap').then((m) => ({ default: m.PinMap })),
)

// Fallback pin drop when geocoding finds nothing (Shelby County, TN)
const FALLBACK_CENTER = { lng: -89.9711, lat: 35.1495 }

const inputCls =
  'mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none'
const labelCls = 'block text-sm font-semibold uppercase tracking-wider text-ash-500'

export function PreplanFormScreen() {
  const { id } = useParams<{ id: string }>()
  const editing = Boolean(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const [address, setAddress] = useState('')
  const [buildingName, setBuildingName] = useState('')
  const [occupancy, setOccupancy] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [hazards, setHazards] = useState('')
  const [notes, setNotes] = useState('')
  const [pin, setPin] = useState<{ lng: number; lat: number } | null>(null)
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [existingDocs, setExistingDocs] = useState<PreplanDocument[]>([])

  const [geoResults, setGeoResults] = useState<GeocodeResult[] | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!editing)

  useEffect(() => {
    if (!editing || !id) return
    Promise.all([
      supabase.from('preplans').select('*, lat, lng').eq('id', id).single(),
      supabase.from('preplan_documents').select('*').eq('preplan_id', id).order('sort_order'),
    ])
      .then(([plan, docs]) => {
        if (plan.error) throw plan.error
        if (docs.error) throw docs.error
        const p = plan.data
        setAddress(p.address ?? '')
        setBuildingName(p.building_name ?? '')
        setOccupancy(p.occupancy_type ?? '')
        setContacts((p.contacts ?? []) as Contact[])
        setHazards(p.hazards ?? '')
        setNotes(p.notes ?? '')
        if (p.lng != null && p.lat != null) setPin({ lng: p.lng, lat: p.lat })
        setExistingDocs((docs.data ?? []) as PreplanDocument[])
        setLoaded(true)
      })
      .catch((err) => {
        console.error('Failed to load preplan', err)
        setError('Could not load this preplan.')
        setLoaded(true)
      })
  }, [editing, id])

  async function findOnMap() {
    if (!address.trim()) return
    setGeoBusy(true)
    setGeoResults(null)
    setError(null)
    try {
      const results = await geocode(address.trim())
      if (results.length === 0) {
        setGeoResults([])
      } else if (results.length === 1) {
        setPin({ lng: results[0].lng, lat: results[0].lat })
      } else {
        setGeoResults(results)
      }
    } catch {
      setError('Geocoding failed — drop the pin manually instead.')
    } finally {
      setGeoBusy(false)
    }
  }

  function updateContact(i: number, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  }

  async function removeDoc(doc: PreplanDocument) {
    setError(null)
    await supabase.storage.from('preplan-pdfs').remove([doc.file_url])
    const { error: err } = await supabase.from('preplan_documents').delete().eq('id', doc.id)
    if (err) {
      setError(err.message)
    } else {
      setExistingDocs((prev) => prev.filter((d) => d.id !== doc.id))
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!profile?.department_id || !address.trim()) return
    setSaving(true)
    setError(null)

    const fields = {
      address: address.trim(),
      building_name: buildingName.trim() || null,
      occupancy_type: occupancy.trim() || null,
      contacts: contacts.filter((c) => c.name.trim() || c.phone.trim()),
      hazards: hazards.trim() || null,
      notes: notes.trim() || null,
      geom: pin ? `SRID=4326;POINT(${pin.lng} ${pin.lat})` : null,
    }

    try {
      let planId = id
      if (editing && id) {
        const { error: err } = await supabase.from('preplans').update(fields).eq('id', id)
        if (err) throw err
      } else {
        const { data, error: err } = await supabase
          .from('preplans')
          .insert(fields)
          .select('id')
          .single()
        if (err) throw err
        planId = data.id as string
      }

      setSavedId(planId!)
      let sortBase = existingDocs.length
      for (const file of pdfFiles) {
        const path = storagePath(profile.department_id, planId!, file.name)
        await uploadFile('preplan-pdfs', path, file, 'application/pdf')
        const { error: docErr } = await supabase.from('preplan_documents').insert({
          preplan_id: planId,
          file_url: path,
          title: file.name.replace(/\.pdf$/i, ''),
          sort_order: sortBase++,
        })
        if (docErr) throw docErr
      }

      navigate(`/preplan/${planId}`)
    } catch (err) {
      console.error('Failed to save preplan', err)
      setError(err instanceof Error ? err.message : 'Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-2xl animate-pulse px-4 py-6">
        <div className="h-8 w-1/2 rounded bg-night-700" />
        <div className="mt-6 h-12 rounded bg-night-800" />
        <div className="mt-4 h-12 rounded bg-night-800" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ash-100">
        {editing ? 'Edit preplan' : 'New preplan'}
      </h2>

      <form onSubmit={submit} className="mt-6 space-y-5">
        <div>
          <label htmlFor="address" className={labelCls}>
            Address *
          </label>
          <div className="flex gap-2">
            <input
              id="address"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="118 Adams Ave, Memphis"
              autoComplete="street-address"
              className={`${inputCls} min-w-0 flex-1`}
            />
            <button
              type="button"
              onClick={findOnMap}
              disabled={geoBusy || !address.trim()}
              className="mt-2 min-h-12 shrink-0 rounded-md border border-night-600 px-4 font-display text-sm font-semibold uppercase tracking-wide text-ash-300 hover:border-hiviz-400 hover:text-hiviz-400 disabled:opacity-50"
            >
              {geoBusy ? 'Finding…' : 'Find on map'}
            </button>
          </div>
          {geoResults && geoResults.length === 0 && (
            <p className="mt-2 text-sm text-ash-500">
              Address not found.{' '}
              <button
                type="button"
                onClick={() => {
                  setPin(FALLBACK_CENTER)
                  setGeoResults(null)
                }}
                className="text-hiviz-400 underline"
              >
                Drop a pin manually
              </button>{' '}
              and drag it into place.
            </p>
          )}
          {geoResults && geoResults.length > 1 && (
            <ul className="mt-2 overflow-hidden rounded-md border border-night-600">
              {geoResults.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      setPin({ lng: r.lng, lat: r.lat })
                      setGeoResults(null)
                    }}
                    className="w-full border-b border-night-700 bg-night-800 px-4 py-3 text-left text-sm text-ash-300 last:border-b-0 hover:text-hiviz-400"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pin ? (
          <div>
            <p className={labelCls}>Pin — drag to the exact building</p>
            <Suspense
              fallback={<div className="mt-2 h-64 w-full animate-pulse rounded-lg bg-night-800" />}
            >
              <PinMap
                lng={pin.lng}
                lat={pin.lat}
                onMove={(lng, lat) => setPin({ lng, lat })}
                className="mt-2 h-64 w-full overflow-hidden rounded-lg border border-night-600"
              />
            </Suspense>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-night-600 px-4 py-3 text-sm text-ash-500">
            No map pin yet — use “Find on map” so this preplan shows up on the district map.
          </p>
        )}

        <div>
          <label htmlFor="buildingName" className={labelCls}>
            Building name
          </label>
          <input
            id="buildingName"
            value={buildingName}
            onChange={(e) => setBuildingName(e.target.value)}
            placeholder="Riverside Apartments — Bldg C"
            className={inputCls}
          />
        </div>

        <div>
          <label htmlFor="occupancy" className={labelCls}>
            Occupancy type
          </label>
          <input
            id="occupancy"
            value={occupancy}
            onChange={(e) => setOccupancy(e.target.value)}
            placeholder="Apartment, Warehouse, School…"
            className={inputCls}
          />
        </div>

        <div>
          <p className={labelCls}>Contacts</p>
          {contacts.map((c, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input
                value={c.name}
                onChange={(e) => updateContact(i, { name: e.target.value })}
                placeholder="Name"
                aria-label={`Contact ${i + 1} name`}
                className="min-h-12 w-[30%] min-w-0 rounded-md border border-night-600 bg-night-800 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
              />
              <input
                value={c.role}
                onChange={(e) => updateContact(i, { role: e.target.value })}
                placeholder="Role"
                aria-label={`Contact ${i + 1} role`}
                className="min-h-12 w-[26%] min-w-0 rounded-md border border-night-600 bg-night-800 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
              />
              <input
                value={c.phone}
                onChange={(e) => updateContact(i, { phone: e.target.value })}
                placeholder="Phone"
                type="tel"
                aria-label={`Contact ${i + 1} phone`}
                className="min-h-12 flex-1 min-w-0 rounded-md border border-night-600 bg-night-800 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setContacts((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Remove contact ${i + 1}`}
                className="min-h-12 shrink-0 px-2 text-ash-500 hover:text-oos-400"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setContacts((prev) => [...prev, { name: '', role: '', phone: '' }])}
            className="mt-2 min-h-10 rounded-md border border-night-600 px-4 text-sm font-semibold text-ash-300 hover:border-hiviz-400 hover:text-hiviz-400"
          >
            + Add contact
          </button>
        </div>

        <div>
          <label htmlFor="hazards" className={labelCls}>
            Hazards
          </label>
          <textarea
            id="hazards"
            rows={3}
            value={hazards}
            onChange={(e) => setHazards(e.target.value)}
            placeholder="Truss roof. Solar panels. Ammonia refrigeration NE corner."
            className={`${inputCls} py-3 text-base`}
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelCls}>
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Knox box at main entrance. Alarm panel in electrical room off lobby."
            className={`${inputCls} py-3 text-base`}
          />
        </div>

        <div>
          <p className={labelCls}>Preplan PDFs</p>
          {existingDocs.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-md border border-night-600">
              {existingDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 border-b border-night-700 bg-night-800 px-4 py-3 last:border-b-0"
                >
                  <span className="min-w-0 truncate text-sm text-ash-300">{d.title ?? 'PDF'}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeDoc(d)}
                      className="shrink-0 text-xs uppercase tracking-widest text-ash-500 hover:text-oos-400"
                    >
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setPdfFiles(Array.from(e.target.files ?? []))}
            className="mt-2 block w-full text-sm text-ash-300 file:mr-3 file:min-h-10 file:rounded-md file:border-0 file:bg-night-700 file:px-4 file:font-display file:text-sm file:font-semibold file:uppercase file:tracking-wide file:text-ash-300"
          />
          {pdfFiles.length > 0 && (
            <p className="mt-1 text-sm text-ash-500">
              {pdfFiles.length} PDF{pdfFiles.length > 1 ? 's' : ''} ready to upload
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-oos-600 bg-night-800 px-4 py-3">
            <p className="text-oos-400">{error}</p>
            {savedId && (
              <Link to={`/preplan/${savedId}`} className="mt-1 block text-sm text-hiviz-400 underline">
                The preplan itself was saved — open it
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !address.trim()}
          className="min-h-14 w-full rounded-md bg-hiviz-400 px-4 font-display text-xl font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create preplan'}
        </button>
      </form>
    </div>
  )
}
