import { useCallback, useEffect, useState } from 'react'

export type AppView =
  | 'dashboard'
  | 'chat'
  | 'workers'
  | 'water'
  | 'devices'
  | 'weather'
  | 'market'
  | 'jobs'
  | 'messages'
  | 'members'
  | 'profile'
  | 'cv'
  | 'admin'

export type WorkerView = 'dashboard' | 'chat' | 'jobs' | 'messages' | 'profile' | 'cv' | 'admin'

export type JobsTab = 'browse' | 'mine' | 'sent' | 'work'

export const SIGNUP_HREF = '#/signup'

export function isSignupHash(hash = typeof window === 'undefined' ? '' : window.location.hash): boolean {
  let path = hash.replace(/^#/, '')
  const q = path.indexOf('?')
  if (q >= 0) path = path.slice(0, q)
  path = path.replace(/\/+$/, '')
  return path === '/signup'
}

export const VIEW_HREF: Record<AppView, string> = {
  dashboard: '#/',
  chat: '#/chat',
  workers: '#/workers',
  water: '#/water',
  devices: '#/devices',
  weather: '#/weather',
  market: '#/market',
  jobs: '#/jobs',
  messages: '#/messages',
  members: '#/members',
  profile: '#/profile',
  cv: '#/cv',
  admin: '#/admin',
}

export function workerView(view: AppView): WorkerView {
  if (view === 'chat' || view === 'jobs' || view === 'messages' || view === 'profile' || view === 'cv' || view === 'admin') {
    return view
  }
  return 'dashboard'
}

export function jobsHref(tab?: JobsTab): string {
  if (!tab || tab === 'browse') return VIEW_HREF.jobs
  return `${VIEW_HREF.jobs}?tab=${tab}`
}

export function peekJobsTab(): JobsTab | null {
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (q < 0) return null
  const raw = new URLSearchParams(hash.slice(q + 1)).get('tab')
  if (raw === 'browse' || raw === 'mine' || raw === 'sent' || raw === 'work') return raw
  return null
}

export function messagesHref(engagementId?: number): string {
  if (engagementId == null || engagementId <= 0) return VIEW_HREF.messages
  return `${VIEW_HREF.messages}?e=${engagementId}`
}

export function peekMessagesEngagement(): number | null {
  const hash = window.location.hash
  const q = hash.indexOf('?')
  if (q < 0) return null
  const raw = new URLSearchParams(hash.slice(q + 1)).get('e')
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  if (!Number.isInteger(n) || n <= 0) return null
  return n
}

const WATER_TAB_KEY = 'aqua_water_tab'
const MARKET_PREFILL_KEY = 'aqua_market_prefill'

export function setWaterTabNeeds(): void {
  try {
    sessionStorage.setItem(WATER_TAB_KEY, 'needs')
  } catch {
    /* private mode / quota */
  }
}

export function peekWaterTabNeeds(): boolean {
  try {
    return sessionStorage.getItem(WATER_TAB_KEY) === 'needs'
  } catch {
    return false
  }
}

export function clearWaterTabNeeds(): void {
  try {
    sessionStorage.removeItem(WATER_TAB_KEY)
  } catch {
    /* private mode */
  }
}

export function setMarketPrefill(litres: number): void {
  try {
    sessionStorage.setItem(MARKET_PREFILL_KEY, JSON.stringify({ litres }))
  } catch {
    /* private mode / quota */
  }
}

export function peekMarketPrefill(): number | null {
  try {
    const raw = sessionStorage.getItem(MARKET_PREFILL_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || !('litres' in parsed)) return null
    const litres = (parsed as { litres: unknown }).litres
    if (typeof litres !== 'number' || !Number.isFinite(litres) || litres <= 0) return null
    return litres
  } catch {
    return null
  }
}

export function clearMarketPrefill(): void {
  try {
    sessionStorage.removeItem(MARKET_PREFILL_KEY)
  } catch {
    /* private mode */
  }
}

function parseViewHash(hash: string): AppView {
  let path = hash.replace(/^#/, '')
  const q = path.indexOf('?')
  if (q >= 0) path = path.slice(0, q)
  path = path.replace(/\/+$/, '')
  if (path === '/chat') return 'chat'
  if (path === '/workers') return 'workers'
  if (path === '/water') return 'water'
  if (path === '/devices') return 'devices'
  if (path === '/weather') return 'weather'
  if (path === '/market') return 'market'
  if (path === '/jobs') return 'jobs'
  if (path === '/messages') return 'messages'
  if (path === '/members') return 'members'
  if (path === '/profile') return 'profile'
  if (path === '/cv') return 'cv'
  if (path === '/admin') return 'admin'
  // Unknown hashes keep the URL so Back still works; the UI shows Dashboard.
  return 'dashboard'
}

export function useView(): {
  view: AppView
  setView: (next: AppView) => void
} {
  const [view, setViewState] = useState<AppView>(() => parseViewHash(window.location.hash))

  useEffect(() => {
    function onHash() {
      setViewState(parseViewHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const setView = useCallback((next: AppView) => {
    const target = VIEW_HREF[next]
    if (window.location.hash === target) return
    if (
      next === 'dashboard' &&
      (window.location.hash === '' || window.location.hash === '#')
    ) {
      return
    }
    window.location.hash = target
  }, [])

  return { view, setView }
}
