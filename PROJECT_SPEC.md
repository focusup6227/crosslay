# Crosslay MVP — Fire Preplan Platform (Project Spec)

## Who I am and what we're building

I'm a career firefighter/paramedic building a pre-incident planning platform for fire departments. My department currently preplans on paper: one sheet per building with a hand-drawn map, filed at the station. The problems: preplans aren't accessible from the truck, can't hold photos, and key info (alarm panel location, keyholder phone numbers, hazards) lives only on paper.

We are building a **mobile-first web app** (PWA) that is a preplan library + map. NOT a form builder, NOT CAD-integrated, NOT a native app. I will personally seed it with my department's existing preplan PDFs.

**Product name:** Crosslay. Use it in the app title, PWA manifest, repo name (`crosslay`), and UI copy. The name comes from the preconnected crosslay attack line on a fire engine — the brand idea is "information, preconnected": building intel loaded and ready before the call drops.

## The core loop

1. A crew member creates a preplan for a building: address, building name, occupancy type, key contacts, and attaches the existing scanned PDF.
2. During a planning visit, they photograph important features (alarm panel, utility shutoffs, hazards, access points) and attach each photo to the preplan with a short location description (e.g., "Alarm panel — electrical room off main lobby").
3. En route or on scene, any crew member opens the app, finds the building via map pin or address search, and instantly sees the PDF, the structured info, and the photos.
4. A toggleable hydrant layer on the map shows every hydrant, color-coded by flow class, with in-service status.

## Tech stack (use exactly this)

- **Frontend:** React + Vite, plain CSS or Tailwind. Mobile-first; must also be comfortable on a landscape laptop (fire trucks have mounted MDT laptops).
- **Map:** MapLibre GL JS with free OSM-based tiles (no Mapbox token dependency for MVP). Marker clustering for dense areas.
- **Backend:** Supabase — Postgres with PostGIS, Auth, Storage (PDFs + photos), Row Level Security.
- **PDF viewing:** render in-app (pdf.js or an embedded viewer) with a fallback "Open PDF" link for old MDT browsers.
- **PWA:** installable, with a basic service worker. Full offline mode is OUT of scope for MVP, but architect storage/fetch so offline caching can be added later.

## Data model

```sql
departments (
  id uuid pk, name text, created_at
)

profiles (  -- extends supabase auth.users
  id uuid pk references auth.users,
  display_name text,
  department_id uuid references departments,
  role text check (role in ('admin','member'))  -- admin = can manage dept data
)

preplans (
  id uuid pk,
  department_id uuid references departments,
  address text not null,
  building_name text,
  occupancy_type text,        -- free text for MVP (e.g., 'Apartment', 'Warehouse')
  geom geometry(Point, 4326), -- map pin
  contacts jsonb default '[]',-- [{name, role, phone}] e.g. keyholder, manager
  hazards text,               -- free-text notes for MVP
  pdf_url text,               -- original scanned preplan in Storage
  notes text,
  created_by uuid, created_at, updated_at
)

preplan_photos (
  id uuid pk,
  preplan_id uuid references preplans on delete cascade,
  photo_url text not null,
  caption text,               -- "Alarm panel — electrical room off lobby"
  geom geometry(Point, 4326), -- optional precise pin
  created_by uuid, created_at
)

hydrants (
  id uuid pk,
  department_id uuid references departments,
  geom geometry(Point, 4326) not null,
  flow_gpm integer,           -- nullable; many sources won't have it
  flow_class text,            -- derive when flow_gpm present: NFPA 291 (blue >=1500, green 1000-1499, orange 500-999, red <500)
  main_size text,
  status text default 'in_service' check (status in ('in_service','out_of_service','unknown')),
  status_note text,           -- "City crew repairing — reported 6/9"
  source text,                -- 'osm' | 'gis_import' | 'manual'
  external_id text,           -- id from source dataset, for re-import dedup
  last_inspected date,
  updated_by uuid, updated_at
)
```

RLS: users only see rows where `department_id` matches their profile. Admins can insert/update department data; members can add preplans/photos and update hydrant status (any firefighter must be able to flag a dead hydrant), but only admins can delete.

## Features in build order

### Phase 1 — Foundation
1. Supabase project schema + RLS policies + Storage buckets (`preplan-pdfs`, `preplan-photos`).
2. Auth: email magic link. Signup joins via a department invite code. First user bootstraps a department and becomes admin.
3. App shell: bottom-tab mobile nav (Map / Search / Add), top-bar layout on wide screens.

### Phase 2 — Preplans
4. Create/edit preplan form: address (with geocoding via Nominatim to set the pin, plus drag-to-adjust), building name, occupancy, contacts (repeatable name/role/phone rows), hazards, notes, PDF upload.
5. Preplan detail view: structured info up top (contacts are tap-to-call `tel:` links), photo grid, embedded PDF viewer. This screen is the product — make it fast and readable in sunlight (high contrast, big touch targets).
6. Photo upload: camera or library, multiple at once, required short caption, client-side compression before upload (crews are on cell connections).
7. Search: type-ahead over address + building name (Postgres `ILIKE`/trigram is fine for MVP). Recent-viewed list on the search screen.

### Phase 3 — Map
8. Map view: preplan pins (tap → bottom-sheet preview → open detail), clustering, "locate me" button.
9. Hydrant layer: toggleable, color-coded by flow_class (gray for unknown), tap → details + "Mark out of service" action with note. OOS hydrants render with a distinct slashed/red marker regardless of class.
10. Nearest hydrants on preplan detail: PostGIS query for the 5 closest hydrants with distance in feet.

### Phase 4 — Importers (critical: I have thousands of existing PDFs)
11. Bulk preplan import (admin web page): upload a CSV (`address, building_name, occupancy_type, contact_name, contact_phone, pdf_filename`) plus a batch of PDF files; the tool matches `pdf_filename` to uploaded files, geocodes addresses via Nominatim (rate-limited, queued, with a manual-fix list for failures), and creates preplan rows. Show progress and a results report.
12. Hydrant import (admin): accepts GeoJSON (covers ArcGIS exports and utility data) AND an "Import from OpenStreetMap" option that takes a drawn bounding box, queries Overpass API for `emergency=fire_hydrant`, and imports with `source='osm'`. Dedup on `external_id` so re-imports update instead of duplicate.

### Phase 5 — Polish
13. PWA manifest + install prompt + service-worker caching of the app shell.
14. Empty states that teach ("No preplans yet — add your first or bulk import"), loading skeletons, error toasts that say what to do.
15. Seed script with 10 fake preplans + 50 fake hydrants for dev.

## Explicitly OUT of scope (do not build, do not scaffold)

- CAD/dispatch integration of any kind
- Custom/per-department form builders (every department gets the same fields in MVP)
- Native iOS/Android apps
- Full offline mode (architect for it, don't build it)
- Billing/payments
- Department-to-department sharing or mutual aid features

## Design direction

Built for a firefighter standing in a dark stairwell or a sun-blasted truck cab: high contrast, large type, large touch targets, minimal chrome. Dark UI base with high-visibility accent (safety yellow-green), red reserved strictly for out-of-service/urgent states. Condensed industrial display type for headings (e.g., Oswald), clean humanist body (e.g., Barlow). No decorative animation. Every screen must be usable one-handed on a phone.

## Working agreements

- Maintain a `HANDOFF.md` in the repo root: current state, decisions made, env vars needed, what's next. Update it at the end of every session.
- Work phase by phase. At the end of each phase, stop and tell me how to test it before moving on.
- Ask me before adding any dependency beyond: react, vite, maplibre-gl, @supabase/supabase-js, pdf.js (or react-pdf), a CSV parser, and Tailwind if used.
- I'll provide Supabase project URL/anon key as env vars; never hardcode secrets.
- Commit messages: conventional, small commits per feature.
