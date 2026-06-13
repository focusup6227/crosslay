import { lazy, Suspense, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { geocode, lngLatFromGeom, type LngLat } from '../lib/geo'

const MapPicker = lazy(() => import('./MapPicker').then((m) => ({ default: m.MapPicker })))
import {
  addDocument,
  createPreplan,
  updatePreplan,
  type PreplanInput,
} from '../lib/preplans'
import { PDF_BUCKET, storagePath, uploadToBucket } from '../lib/storage'
import type { Contact, Preplan } from '../lib/types'

const OCCUPANCY_SUGGESTIONS = [
  'Single-family',
  'Apartment',
  'Commercial',
  'Warehouse',
  'Industrial',
  'School',
  'Healthcare',
  'Assembly',
  'Mercantile',
]

interface Props {
  mode: 'create' | 'edit'
  initial?: Preplan
  onSaved: (preplan: Preplan) => void
  onCancel: () => void
}

const labelClass = 'block text-sm font-semibold uppercase tracking-wider text-ash-500'
const inputClass =
  'mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none'

export function PreplanForm({ mode, initial, onSaved, onCancel }: Props) {
  const { profile } = useAuth()
  const [address, setAddress] = useState(initial?.address ?? '')
  const [buildingName, setBuildingName] = useState(initial?.building_name ?? '')
  const [occupancy, setOccupancy] = useState(initial?.occupancy_type ?? '')
  const [hazards, setHazards] = useState(initial?.hazards ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [lastReviewed, setLastReviewed] = useState(initial?.last_reviewed ?? '')
  const [contacts, setContacts] = useState<Contact[]>(initial?.contacts ?? [])
  const [point, setPoint] = useState<LngLat | null>(
    initial ? lngLatFromGeom(initial.geom) : null,
  )
  const [geoLabel, setGeoLabel] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [pdfs, setPdfs] = useState<File[]>([])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function locate() {
    setError(null)
    setLocating(true)
    try {
      const hit = await geocode(address)
      if (!hit) {
        setGeoLabel(null)
        setError('No match for that address — enter coordinates manually below.')
      } else {
        setPoint({ lng: hit.lng, lat: hit.lat })
        setGeoLabel(hit.label)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Geocoding failed')
    } finally {
      setLocating(false)
    }
  }

  function setContact(i: number, patch: Partial<Contact>) {
    setContacts((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  function addContact() {
    setContacts((prev) => [...prev, { name: '', role: '', phone: '' }])
  }
  function removeContact(i: number) {
    setContacts((prev) => prev.filter((_, idx) => idx !== i))
  }

  function setLatLng(part: 'lat' | 'lng', raw: string) {
    const n = raw === '' ? NaN : Number(raw)
    setPoint((prev) => {
      const base = prev ?? { lat: NaN, lng: NaN }
      return { ...base, [part]: n }
    })
  }

  const validPoint =
    point && Number.isFinite(point.lat) && Number.isFinite(point.lng) ? point : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!address.trim()) {
      setError('Address is required.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const input: PreplanInput = {
        address,
        building_name: buildingName,
        occupancy_type: occupancy,
        contacts: contacts
          .map((c) => ({ name: c.name.trim(), role: c.role.trim(), phone: c.phone.trim() }))
          .filter((c) => c.name || c.role || c.phone),
        hazards,
        notes,
        last_reviewed: lastReviewed,
        point: validPoint,
      }

      const saved =
        mode === 'create' ? await createPreplan(input) : await updatePreplan(initial!.id, input)

      // Create-time PDF attachments — upload after we have the preplan id.
      if (mode === 'create' && pdfs.length && profile?.department_id) {
        for (let i = 0; i < pdfs.length; i++) {
          const file = pdfs[i]
          try {
            const path = storagePath(profile.department_id, saved.id, file.name)
            await uploadToBucket(PDF_BUCKET, path, file, 'application/pdf')
            await addDocument(saved.id, path, file.name, i)
          } catch (err) {
            // Don't lose the created preplan over one bad upload — surface it
            // and let them re-add the document from the detail screen.
            console.error('PDF upload failed', file.name, err)
          }
        }
      }

      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save — try again')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-2xl px-4 py-6">
      <h2 className="font-display text-2xl font-semibold uppercase tracking-wide text-ash-100">
        {mode === 'create' ? 'New preplan' : 'Edit preplan'}
      </h2>

      {/* Address + locate */}
      <div className="mt-6">
        <label htmlFor="address" className={labelClass}>
          Address *
        </label>
        <input
          id="address"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, Memphis, TN"
          className={inputClass}
        />
        <button
          type="button"
          onClick={locate}
          disabled={locating || !address.trim()}
          className="mt-3 min-h-11 rounded-md border border-night-600 px-4 font-semibold text-hiviz-400 disabled:opacity-50"
        >
          {locating ? 'Locating…' : 'Locate address'}
        </button>
        {geoLabel && <p className="mt-2 text-sm text-ash-500">Matched: {geoLabel}</p>}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="lat" className={labelClass}>
              Latitude
            </label>
            <input
              id="lat"
              inputMode="decimal"
              value={point && Number.isFinite(point.lat) ? String(point.lat) : ''}
              onChange={(e) => setLatLng('lat', e.target.value)}
              placeholder="35.1495"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="lng" className={labelClass}>
              Longitude
            </label>
            <input
              id="lng"
              inputMode="decimal"
              value={point && Number.isFinite(point.lng) ? String(point.lng) : ''}
              onChange={(e) => setLatLng('lng', e.target.value)}
              placeholder="-90.0490"
              className={inputClass}
            />
          </div>
        </div>
        <p className="mt-2 text-sm text-ash-500">
          Geocode the address, tap the map, or drag the pin to fine-tune.
        </p>
        <div className="mt-3">
          <Suspense
            fallback={<div className="h-60 w-full rounded-md border border-night-600 bg-night-800" />}
          >
            <MapPicker point={validPoint} onChange={(p) => setPoint(p)} />
          </Suspense>
        </div>
      </div>

      {/* Building name + occupancy */}
      <div className="mt-6">
        <label htmlFor="building" className={labelClass}>
          Building name
        </label>
        <input
          id="building"
          value={buildingName}
          onChange={(e) => setBuildingName(e.target.value)}
          placeholder="Riverside Apartments — Bldg C"
          className={inputClass}
        />
      </div>
      <div className="mt-6">
        <label htmlFor="occupancy" className={labelClass}>
          Occupancy type
        </label>
        <input
          id="occupancy"
          list="occupancy-suggestions"
          value={occupancy}
          onChange={(e) => setOccupancy(e.target.value)}
          placeholder="Warehouse"
          className={inputClass}
        />
        <datalist id="occupancy-suggestions">
          {OCCUPANCY_SUGGESTIONS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>

      {/* Contacts */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-ash-300">
            Contacts
          </h3>
          <button
            type="button"
            onClick={addContact}
            className="min-h-10 rounded-md border border-night-600 px-3 font-semibold text-hiviz-400"
          >
            + Add
          </button>
        </div>
        {contacts.length === 0 && (
          <p className="mt-2 text-sm text-ash-500">Keyholders, managers, on-site contacts.</p>
        )}
        {contacts.map((c, i) => (
          <div key={i} className="mt-3 rounded-md border border-night-700 bg-night-800 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={c.name}
                onChange={(e) => setContact(i, { name: e.target.value })}
                placeholder="Name"
                className={inputClass + ' mt-0'}
              />
              <input
                value={c.role}
                onChange={(e) => setContact(i, { role: e.target.value })}
                placeholder="Role (keyholder)"
                className={inputClass + ' mt-0'}
              />
              <input
                value={c.phone}
                onChange={(e) => setContact(i, { phone: e.target.value })}
                placeholder="Phone"
                type="tel"
                inputMode="tel"
                className={inputClass + ' mt-0'}
              />
            </div>
            <button
              type="button"
              onClick={() => removeContact(i)}
              className="mt-2 text-sm font-semibold text-oos-400"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Hazards + notes */}
      <div className="mt-6">
        <label htmlFor="hazards" className={labelClass}>
          Hazards
        </label>
        <textarea
          id="hazards"
          value={hazards}
          onChange={(e) => setHazards(e.target.value)}
          rows={3}
          placeholder="Solar panels on roof; propane storage rear; truss roof construction"
          className={inputClass + ' py-3'}
        />
      </div>
      <div className="mt-6">
        <label htmlFor="notes" className={labelClass}>
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Knox box left of main entrance. FDC on Oak St side."
          className={inputClass + ' py-3'}
        />
      </div>
      <div className="mt-6">
        <label htmlFor="reviewed" className={labelClass}>
          Last reviewed
        </label>
        <input
          id="reviewed"
          type="date"
          value={lastReviewed ?? ''}
          onChange={(e) => setLastReviewed(e.target.value)}
          className={inputClass}
        />
      </div>

      {/* PDF upload (create only; manage documents on the detail screen after) */}
      {mode === 'create' && (
        <div className="mt-6">
          <label htmlFor="pdfs" className={labelClass}>
            Scanned preplan PDF(s)
          </label>
          <input
            id="pdfs"
            type="file"
            accept="application/pdf"
            multiple
            onChange={(e) => setPdfs(Array.from(e.target.files ?? []))}
            className="mt-2 block w-full text-ash-300 file:mr-3 file:min-h-11 file:rounded-md file:border file:border-night-600 file:bg-night-800 file:px-4 file:font-semibold file:text-hiviz-400"
          />
          {pdfs.length > 0 && (
            <ul className="mt-2 text-sm text-ash-300">
              {pdfs.map((f, i) => (
                <li key={i} className="truncate">
                  • {f.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-4 text-oos-400">{error}</p>}

      <div className="mt-8 flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="min-h-14 flex-1 rounded-md bg-hiviz-400 px-4 font-display text-xl font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
        >
          {busy ? 'Saving…' : mode === 'create' ? 'Create preplan' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-14 rounded-md border border-night-600 px-5 font-semibold text-ash-300"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
