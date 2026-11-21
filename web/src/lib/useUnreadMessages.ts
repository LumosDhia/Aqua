import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'

export function useUnreadMessages(enabled = true): {
  total: number
  refresh: () => void
} {
  const [total, setTotal] = useState(0)
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!enabled) {
      setTotal(0)
      return
    }
    let cancelled = false

    async function load() {
      if (document.hidden) return
      try {
        const unread = await api.messagesUnread()
        if (!cancelled) setTotal(unread.total)
      } catch {
        /* keep the last count; the rail badge is not a place for an error banner */
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 30_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [tick, enabled])

  return { total, refresh }
}
