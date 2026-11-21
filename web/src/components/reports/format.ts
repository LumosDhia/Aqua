import { t } from '../../i18n'
import type { ReportReason, ReportStatus } from '../../api'
import { formatInt } from '../../lib/status'
import { formatDay } from '../market/format'

export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'scam', get label() { return t('reports.fraud') } },
  { id: 'no_show', get label() { return t('reports.noShow') } },
  { id: 'unsafe', get label() { return t('reports.unsafe') } },
  { id: 'harassment', get label() { return t('reports.harassment') } },
  { id: 'other', get label() { return t('common.other') } },
]

export const REPORT_STATUS_FILTERS: { id: 'all' | ReportStatus; label: string }[] = [
  { id: 'all', get label() { return t('common.all') } },
  { id: 'open', get label() { return t('common.open') } },
  { id: 'reviewing', get label() { return t('reports.reviewing') } },
  { id: 'resolved', get label() { return t('reports.resolved') } },
  { id: 'dismissed', get label() { return t('reports.dismissed') } },
]

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((r) => r.id === reason)?.label ?? reason
}

export function reportStatusMeta(status: ReportStatus): {
  label: string
  className: string
} {
  if (status === 'open') {
    return { label: t('common.open'), className: 'bg-ochre-soft/60 text-ink' }
  }
  if (status === 'reviewing') {
    return { label: t('reports.inReview'), className: 'bg-leaf-soft/70 text-forest' }
  }
  if (status === 'resolved') {
    return { label: t('reports.resolved'), className: 'bg-cream-deep text-ink' }
  }
  return { label: t('reports.dismissed'), className: 'bg-cream text-ink-soft' }
}

export function reportsAgainstLabel(n: number): string {
  return n === 1 ? '1 report against' : `${formatInt(n)} reports against`
}

export function reportWhen(iso: string): string {
  return formatDay(iso)
}
