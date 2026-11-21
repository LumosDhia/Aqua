import { t, activeLocale, countLabel } from '../../i18n'
import type {
  Job,
  JobApplicationStatus,
  JobBody,
  JobKind,
  JobPayMode,
  JobPayUnit,
  JobStatus,
} from '../../api'
import { formatTnd } from '../../lib/format'
import { formatInt } from '../../lib/status'
import { dateInputValue, distanceLine, formatDay, osmHref } from '../market/format'

export { dateInputValue, distanceLine, formatDay, osmHref }

const dayMonthFmt = () => new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'short' })

export const JOB_KINDS: { id: JobKind; label: string; chip: string }[] = [
  { id: 'task', get label() { return t('jobs.oneOff') }, get chip() { return t('jobs.task') } },
  { id: 'period', get label() { return t('jobs.fixedTerm') }, get chip() { return t('jobs.period') } },
  { id: 'long_term', get label() { return t('jobs.longTerm') }, get chip() { return t('jobs.longTerm') } },
]

export const PAY_UNITS: { id: JobPayUnit; label: string; per: string }[] = [
  { id: 'hour', get label() { return t('weather.hour') }, get per() { return t('jobs.perHour') } },
  { id: 'day', get label() { return t('water.day') }, get per() { return t('jobs.daily') } },
  { id: 'task', get label() { return t('jobs.task') }, get per() { return t('jobs.perTask') } },
  { id: 'week', get label() { return t('jobs.week') }, get per() { return t('jobs.perWeek') } },
  { id: 'month', get label() { return t('jobs.month') }, get per() { return t('jobs.perMonth') } },
]

export function isJobKind(value: string): value is JobKind {
  return value === 'task' || value === 'period' || value === 'long_term'
}

export function isJobStatus(value: string): value is JobStatus {
  return value === 'open' || value === 'filled' || value === 'closed'
}

export function isJobPayUnit(value: string): value is JobPayUnit {
  return (
    value === 'hour' ||
    value === 'day' ||
    value === 'task' ||
    value === 'week' ||
    value === 'month'
  )
}

export function kindChip(kind: JobKind): string {
  return JOB_KINDS.find((k) => k.id === kind)?.chip ?? kind
}

export function kindChipClass(kind: JobKind): string {
  if (kind === 'period') return 'bg-ochre-soft/60 text-ink'
  if (kind === 'long_term') return 'bg-leaf-soft/70 text-forest'
  return 'bg-cream text-ink'
}

export function payLine(
  mode: JobPayMode,
  amount: number | null,
  unit: JobPayUnit | null,
): string {
  if (mode === 'negotiable' || amount == null) return t('jobs.payNegotiable')
  const per = PAY_UNITS.find((u) => u.id === unit)?.per
  if (!per) return formatTnd(amount)
  return `${formatTnd(amount)} ${per}`
}

function parseDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    if (!y || !mo || !d) return null
    return new Date(y, mo - 1, d)
  }
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function dayMonth(iso: string): string {
  const d = parseDate(iso)
  return d ? dayMonthFmt().format(d) : iso
}

export function jobDates(
  kind: JobKind,
  start: string | null,
  end: string | null,
): string | null {
  if (kind === 'period') {
    if (start && end) return t('common.dateRange', { startDate: dayMonth(start), endDate: dayMonth(end) })
    if (start) return t('common.fromDate', { date: dayMonth(start) })
    if (end) return t('common.untilDate', { date: dayMonth(end) })
    return null
  }
  if (kind === 'task' && start) return t('jobs.onDate', { date: dayMonth(start) })
  if (kind === 'long_term' && start) return t('jobs.starts', { date: dayMonth(start) })
  return null
}

export function jobStatusMeta(status: JobStatus): { label: string; className: string } {
  if (status === 'open') {
    return { label: t('common.open'), className: 'bg-leaf-soft/70 text-forest' }
  }
  if (status === 'filled') {
    return { label: t('jobs.filled'), className: 'bg-teal/15 text-forest' }
  }
  return { label: t('common.closed'), className: 'bg-cream text-ink-soft' }
}

export function applicationStatusMeta(status: JobApplicationStatus): {
  label: string
  className: string
} {
  if (status === 'pending') {
    return { label: t('common.pending'), className: 'bg-ochre-soft/60 text-ink' }
  }
  if (status === 'accepted') {
    return { label: t('common.accepted'), className: 'bg-leaf-soft/70 text-forest' }
  }
  if (status === 'declined') {
    return { label: t('common.declined'), className: 'bg-hanko/10 text-hanko' }
  }
  return { label: t('jobs.withdrawn'), className: 'bg-cream text-ink-soft' }
}

export function jobsCount(n: number): string {
  return countLabel('jobs.count', n)
}

export function applicantsCount(n: number): string {
  return countLabel('jobs.applicantCount', n)
}

export function hiredLine(accepted: number, needed: number): string {
  return `${formatInt(accepted)} of ${formatInt(needed)} hired`
}

export function jobToBody(job: Job): JobBody {
  return {
    title: job.title,
    description: job.description,
    kind: job.kind,
    start_date: job.start_date,
    end_date: job.end_date,
    pay_mode: job.pay_mode,
    pay_amount: job.pay_amount,
    pay_unit: job.pay_unit,
    workers_needed: job.workers_needed,
    skills: job.skills,
    governorate: job.governorate,
    address_text: job.address_text,
    status: job.status,
    radius_km: job.radius_km,
  }
}

export function fromYouLine(km: number | null | undefined): string | null {
  if (km == null) return null
  return t('jobs.fromYou', { distance: formatInt(km) })
}

export function shownWithinLine(km: number | null | undefined): string | null {
  if (km == null) return null
  return t('jobs.withinLower', { distance: formatInt(km) })
}

export function matchSkillsLine(match: number, skills: string[]): string | null {
  if (match <= 0) return null
  if (skills.length === 0) return t('jobs.workTypeMatch')
  if (skills.length === 1) {
    const one = skills[0]
    return one ? t('jobs.skillMatch', { skills: one }) : t('jobs.workTypeMatch')
  }
  return t('jobs.skillsMatch', { total: formatInt(skills.length), skills: skills.join(', ') })
}

export function jobsWithinLine(total: number, radius: number, location: string): string {
  return t('jobs.searchResults', { jobs: jobsCount(total), distance: formatInt(radius), location: location })
}

export function candidateReachLine(distanceKm: number, theirRadius: number): string {
  return t('jobs.distanceAndTravel', { distance: formatInt(distanceKm), radius: formatInt(theirRadius) })
}

export function casedMatching(all: string[], matching: string[]): string[] {
  const want = new Set(matching.map((s) => s.toLowerCase()))
  const hit = all.filter((s) => want.has(s.toLowerCase()))
  if (hit.length >= want.size) return hit
  const seen = new Set(hit.map((s) => s.toLowerCase()))
  for (const s of matching) {
    if (!seen.has(s.toLowerCase())) hit.push(s)
  }
  return hit
}
