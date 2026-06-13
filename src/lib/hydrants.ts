import { supabase } from './supabase'
import { geomFromLngLat, lngLatFromGeom, type LngLat } from './geo'
import type { Hydrant, HydrantStatus } from './types'

export interface HydrantPin {
  id: string
  lng: number
  lat: number
  flow_gpm: number | null
  flow_class: string | null
  main_size: string | null
  status: HydrantStatus
  status_note: string | null
}

export async function listHydrants(): Promise<HydrantPin[]> {
  const { data, error } = await supabase
    .from('hydrants')
    .select('id,geom,flow_gpm,flow_class,main_size,status,status_note')
  if (error) throw error
  const rows = (data ?? []) as Array<Omit<HydrantPin, 'lng' | 'lat'> & { geom: unknown }>
  return rows.flatMap((r) => {
    const ll = lngLatFromGeom(r.geom)
    if (!ll) return []
    const { geom: _geom, ...rest } = r
    return [{ ...rest, ...ll }]
  })
}

/** Any member may flag status / note / inspection date (DB trigger enforces this). */
export async function updateHydrantStatus(
  id: string,
  status: HydrantStatus,
  statusNote: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('hydrants')
    .update({ status, status_note: statusNote?.trim() || null })
    .eq('id', id)
  if (error) throw error
}

/** Admin-only (RLS). Drops a manual hydrant; flow_class derives from gpm via trigger. */
export async function createHydrant(input: {
  point: LngLat
  flow_gpm: number | null
  main_size: string | null
}): Promise<Hydrant> {
  const { data, error } = await supabase
    .from('hydrants')
    .insert({
      geom: geomFromLngLat(input.point),
      flow_gpm: input.flow_gpm,
      main_size: input.main_size?.trim() || null,
      source: 'manual',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Hydrant
}

export interface NearestHydrant {
  id: string
  distance_ft: number
  flow_gpm: number | null
  flow_class: string | null
  status: HydrantStatus
  status_note: string | null
  main_size: string | null
  lng: number
  lat: number
}

export async function nearestHydrants(preplanId: string, limit = 5): Promise<NearestHydrant[]> {
  const { data, error } = await supabase.rpc('nearest_hydrants', {
    p_preplan_id: preplanId,
    p_limit: limit,
  })
  if (error) throw error
  return (data ?? []) as NearestHydrant[]
}
