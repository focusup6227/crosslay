export interface RecentPreplan {
  id: string
  title: string
  address: string
}

const KEY = 'crosslay.recents'
const MAX = 10

export function getRecents(): RecentPreplan[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as RecentPreplan[]) : []
  } catch {
    return []
  }
}

export function pushRecent(entry: RecentPreplan): void {
  try {
    const rest = getRecents().filter((r) => r.id !== entry.id)
    localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, MAX)))
  } catch {
    // storage full or unavailable — recents are best-effort
  }
}
