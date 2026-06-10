# Crosslay

**Information, preconnected.** A mobile-first pre-incident planning platform for fire departments: a preplan library + map, built so building intel (scanned preplans, photos, contacts, hazards, hydrants) is loaded and ready before the call drops.

## Stack

React + Vite + TypeScript + Tailwind · MapLibre GL (OSM tiles) · Supabase (Postgres/PostGIS, Auth, Storage, RLS) · PWA

## Setup

1. Create a Supabase project (PostGIS enabled by the migration).
2. Run `supabase/migrations/0001_init.sql` against it (SQL editor or `supabase db push`).
3. In Supabase **Auth → URL Configuration**, add your dev URL (`http://localhost:5173`) to the redirect allow-list.
4. `cp .env.example .env.local` and fill in the project URL + anon key.
5. `npm install && npm run dev`

First user: sign in with a magic link, choose **Start new** to create your department (you become admin and get an invite code). Everyone else joins with the code.

See `PROJECT_SPEC.md` for the full product spec and `HANDOFF.md` for current build state.
