import { t } from '../i18n'
import type {
  FarmVideo,
  JobApplication,
  MarketInquiry,
  MessageThread,
  OverviewPlot,
  WaterSource,
  WeeklyReportMeta,
} from '../api'
import { canManageJobs, canManageMarket } from '../api'
import { farmWorkOnly } from './farmWorkspace'
import { messagesHref, VIEW_HREF } from './view'

/** Same cutoff the pump uses before it refuses to run. */
export const TANK_LOW_PERCENT = 15

export type NoticeOpen = 'log' | 'water' | null

export type Notice = {
  id: string
  at: string
  whenLabel: string
  kind: string
  title: string
  detail: string
  who: string
  href: string
  open: NoticeOpen
  /** Stays on the list after it is marked read, because the condition is still true. */
  persist: boolean
}

export type NoticeFlags = {
  plots: boolean
  tanks: boolean
  messages: boolean
  jobs: boolean
  market: boolean
  reports: boolean
}

export function noticeFlags(mode: 'farm' | 'worker', farmRole: string, accountRole: string): NoticeFlags {
  const community = mode === 'farm' && !farmWorkOnly({ role: accountRole })
  const farm = mode === 'farm'
  const manager =
    farmRole === 'owner' || farmRole === 'manager' || farmRole === 'admin' || accountRole === 'admin'
  return {
    plots: farm,
    tanks: farm,
    messages: mode === 'worker' || community,
    jobs: community && (manager || canManageJobs(farmRole)),
    market: community && (manager || canManageMarket(farmRole)),
    reports: farm && manager,
  }
}

export type NoticeSources = {
  flags: NoticeFlags
  plots: OverviewPlot[]
  sources: WaterSource[]
  threads: MessageThread[]
  applications: JobApplication[]
  inquiries: MarketInquiry[]
  reports: WeeklyReportMeta[]
  videos: FarmVideo[]
}

function person(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim()
  return trimmed ? trimmed : fallback
}

function push(items: Notice[], item: Notice) {
  items.push(item)
}

export function buildNotices(sources: NoticeSources): Notice[] {
  const items: Notice[] = []
  const { flags } = sources

  if (flags.plots) {
    for (const plot of sources.plots) {
      if (plot.status !== 'dry' && plot.status !== 'critical') continue
      const text = plot.warnings.find((warning) => /dry/i.test(warning))
      if (!text) continue
      const actor = plot.reading_entered_by
      push(items, {
        id: `plot-water-${plot.id}`,
        at: actor?.at || plot.last_ts || '',
        whenLabel: t('farm.recorded'),
        kind: plot.status === 'critical' ? t('dashboard.veryDry') : t('dashboard.needsWater'),
        title: plot.name,
        detail: text,
        who: person(actor?.name, t('notifications.noReadingAuthor')),
        href: VIEW_HREF.dashboard,
        open: null,
        persist: true,
      })
    }
  }

  if (flags.tanks) {
    for (const plot of sources.plots) {
      if (plot.tank_level == null || plot.tank_level >= TANK_LOW_PERCENT) continue
      const text = plot.warnings.find((warning) => /tank/i.test(warning))
      const actor = plot.reading_entered_by
      push(items, {
        id: `plot-tank-${plot.id}`,
        at: actor?.at || plot.last_ts || '',
        whenLabel: t('farm.recorded'),
        kind: t('dashboard.lowTank'),
        title: plot.name,
        detail: text || t('notifications.tankThreshold', { level: Math.round(plot.tank_level), threshold: TANK_LOW_PERCENT }),
        who: person(actor?.name, t('notifications.noReadingAuthor')),
        href: VIEW_HREF.dashboard,
        open: null,
        persist: true,
      })
    }
    for (const source of sources.sources) {
      if (source.kind !== 'tank' && source.kind !== 'rain_tank') continue
      if (source.fill_percent == null || source.fill_percent >= TANK_LOW_PERCENT) continue
      const actor = source.level_entered_by
      push(items, {
        id: `source-tank-${source.id}`,
        at: actor?.at || source.updated_at || '',
        whenLabel: t('farm.recorded'),
        kind: t('dashboard.lowTank'),
        title: source.name,
        detail: t('notifications.tankFill', { level: source.fill_percent, threshold: TANK_LOW_PERCENT }),
        who: person(actor?.name, t('notifications.noLevelAuthor')),
        href: VIEW_HREF.water,
        open: 'water',
        persist: true,
      })
    }
  }

  if (flags.messages) {
    for (const thread of sources.threads) {
      if (thread.unread <= 0) continue
      push(items, {
        id: `message-${thread.engagement_id}`,
        at: thread.last_at,
        whenLabel: t('common.sent'),
        kind: t('notifications.unread'),
        title: thread.title || t('common.message'),
        detail: thread.last_message?.trim() || t('notifications.unreadMessage'),
        who: person(thread.with, t('common.someone')),
        href: messagesHref(thread.engagement_id),
        open: null,
        persist: true,
      })
    }
  }

  if (flags.jobs) {
    for (const application of sources.applications) {
      if (application.status !== 'pending') continue
      push(items, {
        id: `application-${application.id}`,
        at: application.created_at,
        whenLabel: t('jobs.applied'),
        kind: t('common.application'),
        title: application.job_title,
        detail: application.message.trim() || t('notifications.application'),
        who: person(application.applicant?.name, t('notifications.applicant')),
        href: VIEW_HREF.jobs,
        open: null,
        persist: true,
      })
    }
  }

  if (flags.market) {
    for (const inquiry of sources.inquiries) {
      if (inquiry.status !== 'new') continue
      push(items, {
        id: `inquiry-${inquiry.id}`,
        at: inquiry.created_at,
        whenLabel: t('common.sent'),
        kind: t('common.inquiry'),
        title: inquiry.listing_title,
        detail: inquiry.message.trim() || t('notifications.inquiry'),
        who: person(inquiry.sender?.name, t('common.someone')),
        href: VIEW_HREF.market,
        open: null,
        persist: true,
      })
    }
  }

  if (flags.reports) {
    const report = sources.reports[0]
    if (report) {
      push(items, {
        id: `report-${report.id}`,
        at: report.created_at,
        whenLabel: t('common.finished'),
        kind: t('reports.report'),
        title: t('notifications.reportWeek', { week: report.week_start }),
        detail: report.kind === 'manual' ? t('notifications.requested') : t('notifications.reportReady'),
        who: person(report.entered_by?.name, 'Aqua'),
        href: `${VIEW_HREF.dashboard}?panel=log`,
        open: 'log',
        persist: false,
      })
    }
    const film = sources.videos.find((video) => video.status === 'done' && video.finished_at)
    if (film?.finished_at) {
      push(items, {
        id: `film-${film.id}`,
        at: film.finished_at,
        whenLabel: t('common.finished'),
        kind: t('notifications.film'),
        title: t('notifications.filmWeek', { week: film.week_start }),
        detail: t('notifications.filmReady'),
        who: person(film.entered_by?.name, 'Aqua'),
        href: `${VIEW_HREF.dashboard}?panel=log`,
        open: 'log',
        persist: false,
      })
    }
  }

  items.sort((a, b) => {
    const left = Date.parse(a.at)
    const right = Date.parse(b.at)
    const aTime = Number.isNaN(left) ? 0 : left
    const bTime = Number.isNaN(right) ? 0 : right
    if (bTime !== aTime) return bTime - aTime
    return a.title.localeCompare(b.title)
  })
  return items
}
