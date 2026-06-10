// Recently-viewed preplans, kept in localStorage so the Search screen can show
// "jump back to what you just looked at" without a round-trip.

export interface RecentPreplan {
  id: string
  address: string
  building_name: string | null
  viewedAt: number
}

const KEY = 'crosslay.recents'
const MAX = 12

export function getRecents(): RecentPreplan[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const list = JSON.parse(raw) as RecentPreplan[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function pushRecent(entry: Omit<RecentPreplan, 'viewedAt'>): void {
  try {
    const next = [
      { ...entry, viewedAt: Date.now() },
      ...getRecents().filter((r) => r.id !== entry.id),
    ].slice(0, MAX)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore quota / private-mode failures — recents are a convenience
  }
}
