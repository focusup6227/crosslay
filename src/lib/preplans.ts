import { supabase } from './supabase'
import { geomFromLngLat, lngLatFromGeom, type LngLat } from './geo'
import type { Contact, Preplan, PreplanDocument, PreplanPhoto } from './types'

export interface PreplanInput {
  address: string
  building_name: string | null
  occupancy_type: string | null
  contacts: Contact[]
  hazards: string | null
  notes: string | null
  last_reviewed: string | null
  point: LngLat | null
}

function toRow(input: PreplanInput) {
  return {
    address: input.address.trim(),
    building_name: nullableTrim(input.building_name),
    occupancy_type: nullableTrim(input.occupancy_type),
    contacts: input.contacts,
    hazards: nullableTrim(input.hazards),
    notes: nullableTrim(input.notes),
    last_reviewed: input.last_reviewed || null,
    geom: geomFromLngLat(input.point),
  }
}

// department_id and created_by default server-side from the auth context.
export async function createPreplan(input: PreplanInput): Promise<Preplan> {
  const { data, error } = await supabase
    .from('preplans')
    .insert(toRow(input))
    .select('*')
    .single()
  if (error) throw error
  return data as Preplan
}

export async function updatePreplan(id: string, input: PreplanInput): Promise<Preplan> {
  const { data, error } = await supabase
    .from('preplans')
    .update(toRow(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Preplan
}

export async function getPreplan(id: string): Promise<Preplan | null> {
  const { data, error } = await supabase.from('preplans').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Preplan) ?? null
}

export interface PreplanSearchRow {
  id: string
  address: string
  building_name: string | null
  occupancy_type: string | null
}

export async function searchPreplans(query: string, limit = 25): Promise<PreplanSearchRow[]> {
  const q = query.trim()
  let req = supabase
    .from('preplans')
    .select('id,address,building_name,occupancy_type')
    .order('address', { ascending: true })
    .limit(limit)
  if (q) {
    const safe = q.replace(/[%,]/g, ' ')
    req = req.or(`address.ilike.%${safe}%,building_name.ilike.%${safe}%`)
  }
  const { data, error } = await req
  if (error) throw error
  return (data ?? []) as PreplanSearchRow[]
}

export async function deletePreplan(id: string): Promise<void> {
  const { error } = await supabase.from('preplans').delete().eq('id', id)
  if (error) throw error
}

export interface PreplanPin {
  id: string
  address: string
  building_name: string | null
  lng: number
  lat: number
}

/** All located preplans for the map. Unlocated preplans (no geom) are skipped. */
export async function listPreplanPins(): Promise<PreplanPin[]> {
  const { data, error } = await supabase
    .from('preplans')
    .select('id,address,building_name,geom')
  if (error) throw error
  const rows = (data ?? []) as Array<{
    id: string
    address: string
    building_name: string | null
    geom: unknown
  }>
  return rows.flatMap((r) => {
    const ll = lngLatFromGeom(r.geom)
    return ll ? [{ id: r.id, address: r.address, building_name: r.building_name, ...ll }] : []
  })
}

// ---------- Documents ----------

export async function listDocuments(preplanId: string): Promise<PreplanDocument[]> {
  const { data, error } = await supabase
    .from('preplan_documents')
    .select('*')
    .eq('preplan_id', preplanId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PreplanDocument[]
}

export async function addDocument(
  preplanId: string,
  fileUrl: string,
  title: string | null,
  sortOrder: number,
): Promise<void> {
  const { error } = await supabase.from('preplan_documents').insert({
    preplan_id: preplanId,
    file_url: fileUrl,
    title: nullableTrim(title),
    sort_order: sortOrder,
  })
  if (error) throw error
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from('preplan_documents').delete().eq('id', id)
  if (error) throw error
}

// ---------- Photos ----------

export async function listPhotos(preplanId: string): Promise<PreplanPhoto[]> {
  const { data, error } = await supabase
    .from('preplan_photos')
    .select('*')
    .eq('preplan_id', preplanId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as PreplanPhoto[]
}

export async function addPhoto(
  preplanId: string,
  photoUrl: string,
  caption: string,
): Promise<void> {
  const { error } = await supabase.from('preplan_photos').insert({
    preplan_id: preplanId,
    photo_url: photoUrl,
    caption: caption.trim(),
  })
  if (error) throw error
}

export async function deletePhoto(id: string): Promise<void> {
  const { error } = await supabase.from('preplan_photos').delete().eq('id', id)
  if (error) throw error
}

function nullableTrim(v: string | null): string | null {
  if (v == null) return null
  const t = v.trim()
  return t === '' ? null : t
}
