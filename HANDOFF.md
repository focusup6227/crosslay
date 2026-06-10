# HANDOFF — Crosslay

_Last updated: 2026-06-10 (session 2)_

## Current state

**Phase 1 (Foundation) + Phase 2 (Preplans) are code-complete; awaiting Supabase project + user testing.**

- `supabase/migrations/0001_init.sql` — full schema, RLS, triggers, onboarding RPCs, storage buckets + policies. **Not yet applied** — needs a Supabase project.
- Vite + React + TS + Tailwind v4 scaffold; `npm run build` passes.
- Auth flow: magic-link sign-in → onboarding (join via invite code OR create department → admin) → app shell.
- App shell: bottom tabs (Map/Search/Add) on mobile, top-bar nav on `md+`.
- **Hardening (session 2):** Supabase client no longer throws at module load when env vars are missing — `App` gates on `supabaseConfigError` and shows a readable notice; root `ErrorBoundary` in `main.tsx`; `vercel.json` SPA rewrite so deep links / shared `/preplan/:id` URLs don't 404.

### Phase 2 — Preplans (session 2)

- **Create/edit form** (`src/components/PreplanForm.tsx`, screens `AddScreen`/`EditScreen`): address, building name, occupancy (with suggestions datalist), repeatable contacts, hazards, notes, last-reviewed date, and create-time PDF upload. **Pin:** Nominatim geocode (`src/lib/geo.ts`, "Locate address" button — deliberately button-triggered to respect Nominatim's ~1 req/s policy) + manual lat/lng override. Drag-on-map deferred to Phase 3 (no maplibre dep yet — owner-confirmed).
- **Preplan detail** (`src/screens/PreplanDetail.tsx`) — the product screen: hazards rendered first/loud, tap-to-call contacts (`tel:`), notes, location (lat/lng + "open in map"), photo grid, in-app PDF viewer. Edit button; admin-only delete (preplan + per-photo/-doc).
- **PDF viewing** (`src/components/PdfViewer.tsx`): in-app `react-pdf` (pdfjs worker bundled locally, no CDN) + "Open PDF" fallback link — owner-confirmed. Lazy-loaded so pdfjs (~420 kB) stays out of the Map/Search/Add bundle.
- **Photo upload** (`src/components/PhotoUploader.tsx`): camera/library, multi-select, required per-photo caption, client-side canvas compression (long edge ≤1600px, JPEG q0.8) before upload — no extra dep.
- **Search** (`src/screens/SearchScreen.tsx`): debounced (250ms) type-ahead `ILIKE` over address + building name; recently-viewed list (localStorage, `src/lib/recents.ts`) when the box is empty.
- **Storage** (`src/lib/storage.ts`): uploads to `preplan-pdfs`/`preplan-photos` under `{department_id}/{preplan_id}/{uuid}-{name}`; columns store the object **path**, views render short-lived (1h) **signed URLs** on demand (offline-cache-friendly later).
- **New dependency:** `react-pdf` (pre-approved as "pdf.js (or react-pdf)").

### ⚠️ To verify during live testing (couldn't test without a Supabase project)

- **`geom` round-trip over PostgREST.** Writes send EWKT (`SRID=4326;POINT(lng lat)`); reads assume PostgREST serializes the geometry column to GeoJSON. `lngLatFromGeom` also tolerates GeoJSON-as-string and WKT, but if Supabase returns raw hex EWKB the pin just won't render (no crash) — confirm a created preplan's lat/lng shows on the detail screen.
- **Storage RLS path match** — uploads must land under the user's `department_id` first segment; confirm a photo/PDF uploads and the signed URL renders.
- Deleting a preplan cascades document/photo **rows** but leaves their **storage objects** orphaned (per-item delete does remove the object). Acceptable for MVP; a cleanup pass can come later.

## Decisions made (owner-confirmed 2026-06-10)

1. **Multiple documents per preplan** — `preplan_documents` table instead of a single `pdf_url` column.
2. **Review cycle** — `preplans.last_reviewed date`; a "stale preplans" view can come later.
3. **Edit rights** — any department member can edit any preplan; deletes remain admin-only.
4. **No unique address constraint** — suites/strip-mall units file as separate preplans.
5. **react-router-dom approved** as a dependency (shareable `/preplan/:id` URLs matter).
6. Hydrant data source for owner's county (Shelby County, TN) — researched 2026-06-10, see "Hydrant data — Shelby County TN" below.

## Architecture notes

- **Invite code** lives on `departments.invite_code` (auto-generated). Onboarding goes through `security definer` RPCs (`create_department`, `join_department`) so no anonymous read of departments is needed.
- **RLS helpers**: `current_department_id()` / `is_admin()` are `security definer` to avoid profile-policy recursion. All policies scope by department.
- **Member vs admin on hydrants**: RLS lets members update; a trigger (`guard_hydrant_update`) rejects changes beyond `status`/`status_note`/`last_inspected` for non-admins.
- **`flow_class`** auto-derived from `flow_gpm` (NFPA 291) by trigger; directly settable when `flow_gpm` is null.
- **Storage**: private buckets `preplan-pdfs` / `preplan-photos`; path convention `{department_id}/{preplan_id}/{filename}`; storage RLS keys off the first path segment. App will use signed URLs (offline-cache friendly later).
- **`nearest_hydrants(preplan_id, limit)`** RPC already in the migration (security invoker → RLS applies).
- Profile rows auto-created by `on_auth_user_created` trigger; `role`/`department_id` changes blocked except via RPCs or admins (`guard_profile_update`).

## Env vars

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — in `.env.local` (see `.env.example`). Never committed.
- Supabase Auth → URL Configuration must allow `http://localhost:5173` for magic-link redirects.

## How to test Phase 1

1. Create a Supabase project; run `supabase/migrations/0001_init.sql` in the SQL editor.
2. Fill `.env.local`; `npm install && npm run dev`.
3. Sign in with magic link → "Start new" → create your department (check `profiles.role = 'admin'`, department has `invite_code`).
4. Second account (different email) → "Join department" with the code → lands in shell as member.
5. Verify RLS: as member, try `update profiles set role='admin'` from the JS console — should fail.

## Hydrant data — Shelby County TN (researched 2026-06-10)

- **OSM is NOT viable locally**: Overpass count found only ~48 `emergency=fire_hydrant` nodes in the whole county bbox. Build the OSM importer anyway (other departments), but owner needs a GIS source.
- **Memphis FD hydrant FeatureServer exists**: `https://comgis1.memphistn.gov/arcgis/rest/services/AGO_Fire/MFD_Hydrants/FeatureServer` — Google-indexed; layer 2 is a "Fire Hydrant Maintenance Table" with Hydrant IDs (stable IDs exist). Server WAF-blocks non-browser clients (curl/fetch refused); owner should try it in a regular browser, and if layer 0 is public: append `/0/query?where=1%3D1&outFields=*&f=geojson` to export GeoJSON directly — which our Phase 4 importer will accept.
- **MLGW** (runs the water system county-wide) tracks hydrants in enterprise ArcGIS/ArcFM; no public hydrant layer found. They do publish public viewers at `webgisr.mlgw.org`, so publishing is possible — path is a data request via MLGW Land & Mapping (mlgw.com/builders/landandmapping).
- **ReGIS** (Shelby County regional GIS consortium, gis.shelbycountytn.gov) shares layers via a Cooperative GIS Data Sharing Agreement; REST directory is 403 to the public. Fire departments are the textbook member agency — owner's department may already have access.
- **Memphis Data Hub** (data.memphistn.gov) has a "Fire Hydrant Flushing" story page but no confirmed downloadable hydrant point dataset (portal is JS-rendered; needs a manual browse).
- **Import-path implication**: prioritize the GeoJSON importer for ArcGIS exports; hydrant IDs from MFD/MLGW map to `external_id` for re-import dedup.

## What's next

- **Phase 3 (Map)**: MapLibre map with preplan pins (tap → bottom-sheet preview → detail), clustering, locate-me; toggleable hydrant layer color-coded by flow class (OOS = slashed/red); nearest-5 hydrants on preplan detail via the existing `nearest_hydrants` RPC. This is also where the form's **drag-to-place pin** lands (deferred from Phase 2).
- **Phase 4 (Importers)**: bulk preplan CSV+PDF import; hydrant GeoJSON + OSM-bbox import (see hydrant research above).
- **Phase 5 (Polish)**: PWA manifest + service worker, empty/loading/error states, dev seed script.
- Need from owner: Supabase project URL + anon key (locally **and** in Vercel); confirmation the Phase 1 + Phase 2 flows work on his phone (see "To verify during live testing" above).
