export interface GeocodeResult {
  lat: number
  lng: number
  label: string
}

// Nominatim usage policy: low volume, identified by Referer, no autocomplete
// hammering — callers debounce and only search on explicit input.
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '5')

  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocoding failed (${res.status})`)
  const rows = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
  return rows.map((r) => ({
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    label: r.display_name,
  }))
}
