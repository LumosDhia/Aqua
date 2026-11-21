import { t } from '../i18n'
import { useEffect, useState } from 'react'
import { api, isAbortError, type FarmVideo, type JobApplication, type MarketInquiry, type MessageThread, type OverviewPlot, type WaterSource, type WeeklyReportMeta } from '../api'
import { buildNotices, type Notice, type NoticeFlags } from './notices'

const READ_LIMIT = 500

function readKey(userId: number): string {
  return `aqua.notice.read.${userId}`
}

export function loadRead(userId: number): Set<string> {
  try {
    const raw = localStorage.getItem(readKey(userId))
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

function saveRead(userId: number, ids: Set<string>) {
  try {
    const list = [...ids]
    localStorage.setItem(readKey(userId), JSON.stringify(list.slice(-READ_LIMIT)))
  } catch {
    // The list still works for this visit when storage is blocked.
  }
}

async function optional<T>(enabled: boolean, label: string, run: () => Promise<T>, empty: T, problems: string[]): Promise<T> {
  if (!enabled) return empty
  try {
    return await run()
  } catch (error) {
    if (!isAbortError(error)) problems.push(label)
    return empty
  }
}

export function useNotices(
  userId: number,
  farmId: number | null,
  flags: NoticeFlags,
  active: boolean,
  roleKnown = true,
) {
  const [items, setItems] = useState<Notice[]>([])
  const [problems, setProblems] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const [read, setRead] = useState<Set<string>>(() => loadRead(userId))

  useEffect(() => {
    setRead(loadRead(userId))
  }, [userId])

  const flagKey = [
    flags.plots,
    flags.tanks,
    flags.messages,
    flags.jobs,
    flags.market,
    flags.reports,
  ].map((on) => (on ? '1' : '0')).join('')

  useEffect(() => {
    if (!roleKnown) {
      setItems([])
      setProblems([])
      setReady(false)
      return
    }

    let live = true

    async function load() {
      const found: string[] = []
      const id = farmId
      const farm = id != null
      const [overview, water, threads, applications, inquiries, reports, videos] = await Promise.all([
        optional((flags.plots || flags.tanks) && farm, 'plots', () => api.overview(id as number), null, found),
        optional(flags.tanks && farm, 'tanks', () => api.waterSources(id as number), null, found),
        optional(flags.messages, 'messages', () => api.messageThreads(), [] as MessageThread[], found),
        optional(flags.jobs && farm, 'applications', () => api.farmJobApplications(id as number), [] as JobApplication[], found),
        optional(flags.market && farm, 'inquiries', () => api.farmMarketInquiries(id as number), [] as MarketInquiry[], found),
        optional(flags.reports && farm, t('notifications.weeklyReports'), () => api.farmReports(id as number), null, found),
        optional(flags.reports && farm, t('notifications.weeklyFilms'), () => api.farmVideos(id as number), null, found),
      ])
      if (!live) return
      const plots: OverviewPlot[] = overview && overview.farm.id === farmId ? overview.plots : []
      const sources: WaterSource[] = water?.sources ?? []
      const reportRows: WeeklyReportMeta[] = reports?.reports ?? []
      const videoRows: FarmVideo[] = videos?.videos ?? []
      setItems(buildNotices({
        flags,
        plots,
        sources,
        threads,
        applications,
        inquiries,
        reports: reportRows,
        videos: videoRows,
      }))
      setProblems(found)
      setReady(true)
    }

    void load()
    const timer = window.setInterval(() => {
      void load()
    }, active ? 15_000 : 60_000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [userId, farmId, flagKey, active, flags, roleKnown])

  function markRead(id: string) {
    setRead((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      saveRead(userId, next)
      return next
    })
  }

  function markAll(ids: string[]) {
    setRead((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      saveRead(userId, next)
      return next
    })
  }

  const shown = items.filter((item) => item.persist || !read.has(item.id))
  const unread = shown.filter((item) => !read.has(item.id)).length

  return { shown, problems, ready, read, unread, markRead, markAll }
}
