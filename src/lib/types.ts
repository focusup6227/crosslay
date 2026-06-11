export type Role = 'admin' | 'member'

export interface Department {
  id: string
  name: string
  invite_code: string
  created_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  department_id: string | null
  role: Role
  shift_id: string | null
  created_at: string
}

export interface Station {
  id: string
  department_id: string
  name: string
  created_at: string
}

export interface Shift {
  id: string
  station_id: string
  name: string
  created_at: string
}

export interface ShiftNote {
  id: string
  shift_id: string
  body: string
  created_by: string
  created_at: string
}

export interface Contact {
  name: string
  role: string
  phone: string
}

export interface Preplan {
  id: string
  department_id: string
  address: string
  building_name: string | null
  occupancy_type: string | null
  geom: unknown | null
  contacts: Contact[]
  hazards: string | null
  notes: string | null
  last_reviewed: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface PreplanDocument {
  id: string
  preplan_id: string
  file_url: string
  title: string | null
  sort_order: number
  created_by: string
  created_at: string
}

export interface PreplanPhoto {
  id: string
  preplan_id: string
  photo_url: string
  caption: string | null
  geom: unknown | null
  created_by: string
  created_at: string
}

export type HydrantStatus = 'in_service' | 'out_of_service' | 'unknown'
export type FlowClass = 'blue' | 'green' | 'orange' | 'red'

export interface Hydrant {
  id: string
  department_id: string
  geom: unknown
  flow_gpm: number | null
  flow_class: FlowClass | null
  main_size: string | null
  status: HydrantStatus
  status_note: string | null
  source: 'osm' | 'gis_import' | 'manual' | null
  external_id: string | null
  last_inspected: string | null
  updated_by: string | null
  updated_at: string
}
