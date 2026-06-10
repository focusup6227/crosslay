# HANDOFF — Crosslay

_Last updated: 2026-06-10 (session 1)_

## Current state

**Phase 1 (Foundation) is code-complete; awaiting Supabase project + user testing.**

- `supabase/migrations/0001_init.sql` — full schema, RLS, triggers, onboarding RPCs, storage buckets + policies. **Not yet applied** — needs a Supabase project.
- Vite + React + TS + Tailwind v4 scaffold; `npm run build` passes.
- Auth flow: magic-link sign-in → onboarding (join via invite code OR create department → admin) → app shell.
- App shell: bottom tabs (Map/Search/Add) on mobile, top-bar nav on `md+`; screens are Phase 2/3 placeholders.

## Decisions made (owner-confirmed 2026-06-10)

1. **Multiple documents per preplan** — `preplan_documents` table instead of a single `pdf_url` column.
2. **Review cycle** — `preplans.last_reviewed date`; a "stale preplans" view can come later.
3. **Edit rights** — any department member can edit any preplan; deletes remain admin-only.
4. **No unique address constraint** — suites/strip-mall units file as separate preplans.
5. **react-router-dom approved** as a dependency (shareable `/preplan/:id` URLs matter).
6. Hydrant data source for owner's county (Shelby County, TN) under research — see "Hydrant data" below when populated.

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

## What's next

- **Phase 2**: preplan create/edit form (Nominatim geocode + drag pin), detail view (the product!), photo upload w/ compression, search + recents.
- Need from owner: Supabase project URL + anon key; confirmation Phase 1 flow works on his phone.
- Pending: Shelby County TN hydrant-data research results (background agent, session 1) — fold findings into Phase 4 import planning.
