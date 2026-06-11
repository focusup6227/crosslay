import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

interface PinMapProps {
  lng: number
  lat: number
  onMove: (lng: number, lat: number) => void
  className?: string
}

// Single draggable marker over free OSM raster tiles. The parent owns the
// coordinates; external changes (e.g. picking a new geocode hit) fly the
// map to the new spot.
export function PinMap({ lng, lat, onMove, className }: PinMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const onMoveRef = useRef(onMove)
  onMoveRef.current = onMove

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: 17,
      attributionControl: { compact: true },
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }))

    const marker = new maplibregl.Marker({ draggable: true, color: '#cdff3d' })
      .setLngLat([lng, lat])
      .addTo(map)
    marker.on('dragend', () => {
      const pos = marker.getLngLat()
      onMoveRef.current(pos.lng, pos.lat)
    })

    mapRef.current = map
    markerRef.current = marker
    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const marker = markerRef.current
    const map = mapRef.current
    if (!marker || !map) return
    const pos = marker.getLngLat()
    if (Math.abs(pos.lng - lng) > 1e-9 || Math.abs(pos.lat - lat) > 1e-9) {
      marker.setLngLat([lng, lat])
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 17) })
    }
  }, [lng, lat])

  return <div ref={containerRef} className={className ?? 'h-64 w-full rounded-lg'} />
}
