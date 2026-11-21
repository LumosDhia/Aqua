import { t } from '../../i18n'
import type { Engagement, EngagementKind, EngagementStatus } from '../../api'
import { formatDay } from '../jobs/format'

export function engagementKindLabel(kind: EngagementKind): string {
  return kind === 'full_time' ? t('jobs.fullTime') : t('workers.temporary')
}

export function engagementKindClass(kind: EngagementKind): string {
  return kind === 'full_time' ? 'bg-leaf-soft/70 text-forest' : 'bg-ochre-soft/60 text-ink'
}

export function engagementStatusMeta(status: EngagementStatus): {
  label: string
  className: string
} {
  if (status === 'active') {
    return { label: t('common.active'), className: 'bg-leaf-soft/70 text-forest' }
  }
  if (status === 'finished') {
    return { label: t('common.finished'), className: 'bg-cream text-ink-soft' }
  }
  return { label: t('workers.disapproved'), className: 'bg-hanko/10 text-hanko' }
}

export function engagementDates(start: string | null, end: string | null): string | null {
  if (start && end) return t('common.dateRange', { startDate: formatDay(start), endDate: formatDay(end) })
  if (start) return t('common.fromDate', { date: formatDay(start) })
  if (end) return t('common.untilDate', { date: formatDay(end) })
  return null
}

const STATUS_RANK: Record<EngagementStatus, number> = {
  active: 0,
  finished: 1,
  disapproved: 2,
}

export function sortMine(rows: Engagement[]): Engagement[] {
  return rows.slice().sort((a, b) => {
    const d = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (d !== 0) return d
    return b.created_at.localeCompare(a.created_at)
  })
}
