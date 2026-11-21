import { useEffect, useState } from 'react'
import { api, canManageJobs, canManageMarket } from '../api'
import type { AppView } from './view'

export type BadgeCounts = {
  newInquiries: number
  pendingApplications: number
}

export function useBadges(
  farmId: number | null,
  role: string,
  refreshKey: number,
  view: AppView,
  enabled = true,
): BadgeCounts {
  const [newInquiries, setNewInquiries] = useState(0)
  const [pendingApplications, setPendingApplications] = useState(0)
  const show = enabled && (canManageMarket(role) || canManageJobs(role))

  useEffect(() => {
    if (farmId == null || !show) {
      setNewInquiries(0)
      setPendingApplications(0)
      return
    }

    const id = farmId
    let cancelled = false

    async function load() {
      const [marketR, jobsR] = await Promise.allSettled([
        canManageMarket(role) ? api.farmMarketListings(id) : Promise.resolve([]),
        canManageJobs(role) ? api.farmJobs(id) : Promise.resolve([]),
      ])
      if (cancelled) return
      if (marketR.status === 'fulfilled') {
        setNewInquiries(marketR.value.reduce((s, l) => s + (l.new_inquiries ?? 0), 0))
      }
      if (jobsR.status === 'fulfilled') {
        setPendingApplications(
          jobsR.value.reduce((s, j) => s + (j.pending_applications ?? 0), 0),
        )
      }
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, 60_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [farmId, role, refreshKey, view, show])

  return { newInquiries, pendingApplications }
}
