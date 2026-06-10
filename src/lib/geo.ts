// Geocoding (Nominatim) and PostGIS point helpers.

export interface LngLat {
  lng: number
  lat: number
}

export interface GeocodeResult extends LngLat {
  label: string
}

/**
 * Forward-geocode a free-text address via OpenStreetMap Nominatim.
 * Call this on an explicit user action (button), never per keystroke —
 * Nominatim's usage policy caps at ~1 request/second.
 */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  const q = query.trim()
  if (!q) return null
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('addressdetails', '0')

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  if (!rows.length) return null
  const top = rows[0]
  return { lat: Number(top.lat), lng: Number(top.lon), label: top.display_name }
}

/**
 * PostGIS-via-PostgREST returns geometry as a GeoJSON object on read; on write
 * it accepts EWKT text. These helpers tolerate GeoJSON objects/strings and
 * WKT/EWKT strings so the app doesn't care which form a row carries.
 */
export function lngLatFromGeom(geom: unknown): LngLat | null {
  if (!geom) return null

  // GeoJSON object: { type: 'Point', coordinates: [lng, lat] }
  if (typeof geom === 'object') {
    const coords = (geom as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      const [lng, lat] = coords as number[]
      if (Number.isFinite(lng) && Number.isFinite(lat)) return { lng, lat }
    }
    return null
  }

  if (typeof geom === 'string') {
    // GeoJSON encoded as a string
    if (geom.trim().startsWith('{')) {
      try {
        return lngLatFromGeom(JSON.parse(geom))
      } catch {
        return null
      }
    }
    // (E)WKT: "SRID=4326;POINT(-89.97 35.12)" or "POINT(-89.97 35.12)"
    const m = geom.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
    if (m) return { lng: Number(m[1]), lat: Number(m[2]) }
  }
  return null
}

/** Build the EWKT string PostgREST stores into a geometry(Point,4326) column. */
export function geomFromLngLat(point: LngLat | null): string | null {
  if (!point) return null
  if (!Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return null
  return `SRID=4326;POINT(${point.lng} ${point.lat})`
}
