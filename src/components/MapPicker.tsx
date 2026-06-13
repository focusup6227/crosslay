import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { OSM_STYLE } from '../lib/mapStyle'
import type { LngLat } from '../lib/geo'

const FALLBACK_CENTER: [number, number] = [-90.049, 35.1495] // Memphis, TN

/**
 * Small map for placing/adjusting a preplan pin: click to drop, drag to fine-tune.
 * Controlled — `point` recenters the marker (e.g. after a geocode); marker/map
 * interactions call `onChange`.
 */
export function MapPicker({
  point,
  onChange,
}: {
  point: LngLat | null
  onChange: (p: LngLat) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return
    const start: [number, number] = point ? [point.lng, point.lat] : FALLBACK_CENTER
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: start,
      zoom: point ? 16 : 11,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    const marker = new maplibregl.Marker({ color: '#cdff3d', draggable: true })
    markerRef.current = marker
    if (point) marker.setLngLat(start).addTo(map)

    marker.on('dragend', () => {
      const ll = marker.getLngLat()
      onChangeRef.current({ lng: ll.lng, lat: ll.lat })
    })

    map.on('click', (e) => {
      marker.setLngLat(e.lngLat).addTo(map)
      onChangeRef.current({ lng: e.lngLat.lng, lat: e.lngLat.lat })
    })

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect externally-set points (geocode / manual lat-lng) onto the map.
  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker || !point) return
    const cur = marker.getLngLat()
    const moved = !cur || Math.abs(cur.lng - point.lng) > 1e-7 || Math.abs(cur.lat - point.lat) > 1e-7
    if (moved) {
      marker.setLngLat([point.lng, point.lat]).addTo(map)
      map.easeTo({ center: [point.lng, point.lat], zoom: Math.max(map.getZoom(), 15), duration: 300 })
    }
  }, [point])

  return <div ref={containerRef} className="h-60 w-full overflow-hidden rounded-md border border-night-600" />
}
