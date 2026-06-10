import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

const TABS = [
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/search', label: 'Search', icon: SearchIcon },
  { to: '/add', label: 'Add', icon: PlusIcon },
  { to: '/station', label: 'Station', icon: StationIcon },
]

export function AppShell() {
  const { profile, signOut } = useAuth()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar — brand on mobile, brand + nav on wide screens (MDT laptops) */}
      <header className="flex items-center justify-between border-b border-night-700 bg-night-950 px-4 py-3">
        <span className="font-display text-2xl font-semibold uppercase tracking-wide text-hiviz-400">
          Crosslay
        </span>
        <nav className="hidden items-center gap-1 md:flex">
          {TABS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `min-h-12 rounded-md px-5 py-2.5 font-display text-lg font-semibold uppercase tracking-wide ${
                  isActive ? 'bg-hiviz-400 text-night-950' : 'text-ash-300 hover:bg-night-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="min-h-10 rounded-md px-3 text-sm text-ash-500 hover:text-ash-300"
          title={profile?.display_name ?? undefined}
        >
          Sign out
        </button>
      </header>

      {/* Screen content; bottom padding clears the mobile tab bar */}
      <main className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile only, big one-handed targets */}
      <nav className="fixed inset-x-0 bottom-0 grid grid-cols-4 border-t border-night-700 bg-night-950 pb-[env(safe-area-inset-bottom)] md:hidden">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex min-h-16 flex-col items-center justify-center gap-1 ${
                isActive ? 'text-hiviz-400' : 'text-ash-500'
              }`
            }
          >
            <Icon />
            <span className="font-display text-xs font-semibold uppercase tracking-widest">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function MapIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 3 3.6 5.2a1 1 0 0 0-.6.92V19.5a.5.5 0 0 0 .69.46L9 18l6 3 5.4-2.2a1 1 0 0 0 .6-.92V4.5a.5.5 0 0 0-.69-.46L15 6 9 3Z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function StationIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M9 20v-7h6v7" />
    </svg>
  )
}
