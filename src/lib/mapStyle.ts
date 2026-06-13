import type { StyleSpecification } from 'maplibre-gl'
import type { FlowClass } from './types'

// Free OSM raster tiles — no Mapbox/MapTiler token for the MVP (per spec).
// NOTE: tile.openstreetmap.org is fine for dev / a single department; a real
// multi-department rollout should move to a proper tile provider (rate limits).
export const OSM_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

// NFPA 291 flow-class colors; unknown/no-flow renders gray.
export const FLOW_COLORS: Record<FlowClass, string> = {
  blue: '#2f6fdb',
  green: '#33c05a',
  orange: '#f59e0b',
  red: '#ef4444',
}
export const FLOW_UNKNOWN = '#9aa6b0'
export const OOS_COLOR = '#ff5147'
