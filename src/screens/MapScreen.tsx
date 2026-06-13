import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useAuth } from '../auth/AuthProvider'
import { listPreplanPins, type PreplanPin } from '../lib/preplans'
import { createHydrant, listHydrants, updateHydrantStatus, type HydrantPin } from '../lib/hydrants'
import { FLOW_COLORS, FLOW_UNKNOWN, OOS_COLOR, OSM_STYLE } from '../lib/mapStyle'
import type { LngLat } from '../lib/geo'

const FALLBACK_CENTER: [number, number] = [-90.049, 35.1495] // Memphis, TN

function preplanFC(pins: PreplanPin[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pins.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, title: p.building_name || p.address, address: p.address },
    })),
  }
}

function hydrantFC(hydrants: HydrantPin[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: hydrants.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [h.lng, h.lat] },
      properties: { id: h.id, flow_class: h.flow_class, status: h.status },
    })),
  }
}

export function MapScreen() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin'

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const addModeRef = useRef(false)
  const fittedRef = useRef(false)
  // newGpm/newMain read inside a map click handler — mirror to refs.
  const newGpmRef = useRef('')
  const newMainRef = useRef('')

  const [ready, setReady] = useState(false)
  const [pins, setPins] = useState<PreplanPin[]>([])
  const [hydrants, setHydrants] = useState<HydrantPin[]>([])
  const [showHydrants, setShowHydrants] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selPreplan, setSelPreplan] = useState<{ id: string; title: string; address: string } | null>(
    null,
  )
  const [selHydrant, setSelHydrant] = useState<HydrantPin | null>(null)

  const [addMode, setAddMode] = useState(false)
  const [newGpm, setNewGpm] = useState('')
  const [newMain, setNewMain] = useState('')

  async function refreshData() {
    try {
      const [p, h] = await Promise.all([listPreplanPins(), listHydrants()])
      setPins(p)
      setHydrants(h)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load map data')
    }
  }

  // resolve a hydrant by id against the latest list (avoids a stale closure)
  function selectHydrantById(id: string) {
    setHydrants((cur) => {
      const h = cur.find((x) => x.id === id)
      if (h) setSelHydrant(h)
      return cur
    })
  }

  async function placeHydrant(point: LngLat) {
    try {
      await createHydrant({
        point,
        flow_gpm: newGpmRef.current.trim() ? Number(newGpmRef.current) : null,
        main_size: newMainRef.current,
      })
      exitAddMode()
      setNewGpm('')
      setNewMain('')
      newGpmRef.current = ''
      newMainRef.current = ''
      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add hydrant')
    }
  }

  function exitAddMode() {
    setAddMode(false)
    addModeRef.current = false
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = ''
  }

  // ---- Map init (once) ----
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: FALLBACK_CENTER,
      zoom: 11,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'top-right',
    )

    map.on('load', () => {
      map.addSource('preplans', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 50,
      })
      map.addSource('hydrants', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Hydrants under preplans so a preplan pin always wins a tap.
      map.addLayer({
        id: 'hydrant-point',
        type: 'circle',
        source: 'hydrants',
        paint: {
          'circle-radius': 6,
          'circle-stroke-width': 2,
          'circle-color': [
            'case',
            ['==', ['get', 'status'], 'out_of_service'],
            OOS_COLOR,
            [
              'match',
              ['get', 'flow_class'],
              'blue', FLOW_COLORS.blue,
              'green', FLOW_COLORS.green,
              'orange', FLOW_COLORS.orange,
              'red', FLOW_COLORS.red,
              FLOW_UNKNOWN,
            ],
          ],
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'status'], 'out_of_service'],
            '#ffffff',
            '#07090b',
          ],
        },
      })

      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'preplans',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#cdff3d',
          'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#07090b',
        },
      })
      map.addLayer({
        id: 'cluster-count',
        type: 'symbol',
        source: 'preplans',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#07090b' },
      })
      map.addLayer({
        id: 'preplan-point',
        type: 'circle',
        source: 'preplans',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#cdff3d',
          'circle-radius': 8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#07090b',
        },
      })

      const pointer = () => {
        map.getCanvas().style.cursor = 'pointer'
      }
      const noPointer = () => {
        map.getCanvas().style.cursor = addModeRef.current ? 'crosshair' : ''
      }
      for (const id of ['clusters', 'preplan-point', 'hydrant-point']) {
        map.on('mouseenter', id, pointer)
        map.on('mouseleave', id, noPointer)
      }

      map.on('click', 'clusters', (e) => {
        const f = e.features?.[0] as MapGeoJSONFeature | undefined
        const clusterId = f?.properties?.cluster_id
        if (clusterId == null) return
        const src = map.getSource('preplans') as GeoJSONSource
        src.getClusterExpansionZoom(clusterId).then((zoom) => {
          map.easeTo({
            center: (f!.geometry as Point).coordinates as [number, number],
            zoom,
          })
        })
      })

      map.on('click', 'preplan-point', (e) => {
        if (addModeRef.current) return
        const p = e.features?.[0]?.properties
        if (p) setSelPreplan({ id: p.id, title: p.title, address: p.address })
      })

      map.on('click', 'hydrant-point', (e) => {
        if (addModeRef.current) return
        const id = e.features?.[0]?.properties?.id
        if (id) selectHydrantById(id)
      })

      // Bare-map click: place a hydrant while in add mode.
      map.on('click', (e) => {
        if (!addModeRef.current) return
        const hits = map.queryRenderedFeatures(e.point, { layers: ['preplan-point', 'clusters'] })
        if (hits.length) return
        placeHydrant({ lng: e.lngLat.lng, lat: e.lngLat.lat })
      })

      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
      fittedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Initial data ----
  useEffect(() => {
    refreshData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Sync data into map sources ----
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource('preplans') as GeoJSONSource | undefined)?.setData(preplanFC(pins))
    ;(map.getSource('hydrants') as GeoJSONSource | undefined)?.setData(hydrantFC(hydrants))

    if (!fittedRef.current && pins.length) {
      fittedRef.current = true
      const b = new maplibregl.LngLatBounds()
      pins.forEach((p) => b.extend([p.lng, p.lat]))
      map.fitBounds(b, { padding: 64, maxZoom: 16, duration: 0 })
    }
  }, [ready, pins, hydrants])

  // ---- Hydrant layer visibility ----
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (map.getLayer('hydrant-point')) {
      map.setLayoutProperty('hydrant-point', 'visibility', showHydrants ? 'visible' : 'none')
    }
  }, [ready, showHydrants])

  function toggleAddMode() {
    const next = !addMode
    setAddMode(next)
    addModeRef.current = next
    setSelHydrant(null)
    setSelPreplan(null)
    if (mapRef.current) mapRef.current.getCanvas().style.cursor = next ? 'crosshair' : ''
  }

  async function markStatus(h: HydrantPin, status: HydrantPin['status'], note: string | null) {
    try {
      await updateHydrantStatus(h.id, status, note)
      setSelHydrant(null)
      await refreshData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    }
  }

  return (
    <div className="relative h-[calc(100dvh-3.5rem-6rem)] w-full md:h-[calc(100dvh-3.5rem)]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top overlay controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <div className="flex gap-2">
          <button
            onClick={() => setShowHydrants((v) => !v)}
            className={`pointer-events-auto min-h-10 rounded-md border px-3 font-semibold shadow ${
              showHydrants
                ? 'border-hiviz-400 bg-hiviz-400 text-night-950'
                : 'border-night-600 bg-night-900 text-ash-300'
            }`}
          >
            Hydrants {showHydrants ? 'on' : 'off'}
          </button>
          {isAdmin && (
            <button
              onClick={toggleAddMode}
              className={`pointer-events-auto min-h-10 rounded-md border px-3 font-semibold shadow ${
                addMode
                  ? 'border-oos-400 bg-oos-400 text-night-950'
                  : 'border-night-600 bg-night-900 text-ash-300'
              }`}
            >
              {addMode ? 'Cancel' : '+ Hydrant'}
            </button>
          )}
        </div>

        {addMode && (
          <div className="pointer-events-auto max-w-sm rounded-md border border-night-600 bg-night-900 p-3 shadow">
            <p className="text-sm text-ash-300">Tap the map to drop a hydrant.</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={newGpm}
                onChange={(e) => {
                  setNewGpm(e.target.value)
                  newGpmRef.current = e.target.value
                }}
                inputMode="numeric"
                placeholder="Flow (gpm)"
                className="min-h-10 rounded-md border border-night-600 bg-night-800 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
              />
              <input
                value={newMain}
                onChange={(e) => {
                  setNewMain(e.target.value)
                  newMainRef.current = e.target.value
                }}
                placeholder="Main size"
                className="min-h-10 rounded-md border border-night-600 bg-night-800 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
              />
            </div>
          </div>
        )}

        {error && (
          <p className="pointer-events-auto max-w-sm rounded-md bg-night-900 p-2 text-oos-400 shadow">
            {error}
          </p>
        )}
      </div>

      {/* Preplan preview sheet */}
      {selPreplan && (
        <BottomSheet onClose={() => setSelPreplan(null)}>
          <p className="font-display text-xl font-semibold uppercase tracking-wide text-ash-100">
            {selPreplan.title}
          </p>
          <p className="mt-1 text-ash-300">{selPreplan.address}</p>
          <button
            onClick={() => navigate(`/preplan/${selPreplan.id}`)}
            className="mt-4 min-h-12 w-full rounded-md bg-hiviz-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950"
          >
            Open preplan
          </button>
        </BottomSheet>
      )}

      {/* Hydrant sheet */}
      {selHydrant && (
        <HydrantSheet
          key={selHydrant.id}
          hydrant={selHydrant}
          onClose={() => setSelHydrant(null)}
          onMark={markStatus}
        />
      )}
    </div>
  )
}

function BottomSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 p-3">
      <div className="mx-auto w-full max-w-md rounded-xl border border-night-600 bg-night-900 p-4 shadow-2xl">
        <div className="flex justify-end">
          <button onClick={onClose} className="text-ash-500" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function HydrantSheet({
  hydrant,
  onClose,
  onMark,
}: {
  hydrant: HydrantPin
  onClose: () => void
  onMark: (h: HydrantPin, status: HydrantPin['status'], note: string | null) => void
}) {
  const [note, setNote] = useState(hydrant.status_note ?? '')
  const oos = hydrant.status === 'out_of_service'
  return (
    <BottomSheet onClose={onClose}>
      <p className="font-display text-xl font-semibold uppercase tracking-wide text-ash-100">
        Hydrant
      </p>
      <dl className="mt-2 space-y-1 text-ash-300">
        <Row label="Flow">
          {hydrant.flow_gpm != null ? `${hydrant.flow_gpm} gpm` : 'Unknown'}
          {hydrant.flow_class ? ` (${hydrant.flow_class})` : ''}
        </Row>
        {hydrant.main_size && <Row label="Main">{hydrant.main_size}</Row>}
        <Row label="Status">
          <span className={oos ? 'font-semibold text-oos-400' : 'text-ash-100'}>
            {hydrant.status.replace(/_/g, ' ')}
          </span>
        </Row>
      </dl>

      <label className="mt-3 block text-sm font-semibold uppercase tracking-wider text-ash-500">
        Status note
      </label>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="City crew repairing — reported today"
        className="mt-1 min-h-11 w-full rounded-md border border-night-600 bg-night-800 px-3 text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
      />

      {oos ? (
        <button
          onClick={() => onMark(hydrant, 'in_service', note || null)}
          className="mt-4 min-h-12 w-full rounded-md bg-hiviz-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950"
        >
          Mark back in service
        </button>
      ) : (
        <button
          onClick={() => onMark(hydrant, 'out_of_service', note || null)}
          className="mt-4 min-h-12 w-full rounded-md bg-oos-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950"
        >
          Mark out of service
        </button>
      )}
    </BottomSheet>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ash-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}
