import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { Onboarding } from './auth/Onboarding'
import { AppShell } from './shell/AppShell'
import { SearchScreen } from './screens/SearchScreen'
import { AddScreen } from './screens/AddScreen'
import { EditScreen } from './screens/EditScreen'
import { PreplanDetail } from './screens/PreplanDetail'
import { supabaseConfigError } from './lib/supabase'

// maplibre is heavy — keep it out of the app-shell/auth/search bundle.
const MapScreen = lazy(() => import('./screens/MapScreen').then((m) => ({ default: m.MapScreen })))

function ConfigNotice({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-hiviz-400">
        Crosslay
      </h1>
      <div className="mt-8 w-full max-w-sm rounded-lg border border-oos-600 bg-night-800 p-6">
        <p className="text-xl font-semibold text-oos-400">Not configured</p>
        <p className="mt-3 text-ash-300">{message}</p>
      </div>
    </div>
  )
}

function Gate() {
  const { session, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="font-display text-3xl font-semibold uppercase tracking-wide text-hiviz-400">
          Crosslay
        </span>
      </div>
    )
  }

  if (!session) return <SignIn />
  if (!profile?.department_id) return <Onboarding />

  return (
    <Suspense
      fallback={<div className="flex min-h-dvh items-center justify-center text-ash-500">Loading…</div>}
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/map" element={<MapScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/add" element={<AddScreen />} />
          <Route path="/preplan/:id" element={<PreplanDetail />} />
          <Route path="/preplan/:id/edit" element={<EditScreen />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  // Gate the whole tree before anything touches Supabase, so a misconfigured
  // deploy shows this notice instead of white-screening.
  if (supabaseConfigError) return <ConfigNotice message={supabaseConfigError} />

  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
