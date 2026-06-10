import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { SignIn } from './auth/SignIn'
import { Onboarding } from './auth/Onboarding'
import { AppShell } from './shell/AppShell'
import { MapScreen } from './screens/MapScreen'
import { SearchScreen } from './screens/SearchScreen'
import { AddScreen } from './screens/AddScreen'

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
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/map" element={<MapScreen />} />
        <Route path="/search" element={<SearchScreen />} />
        <Route path="/add" element={<AddScreen />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
