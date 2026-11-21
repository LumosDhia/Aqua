import { t, activeLocale } from '../../i18n'
import { formatRelative } from '../../lib/status'

const dayFmt = () => new Intl.DateTimeFormat(activeLocale(), {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const dayYearFmt = () => new Intl.DateTimeFormat(activeLocale(), {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function messageDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function messageDayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = startOfDay(new Date())
  const then = startOfDay(d)
  const diff = Math.round((today - then) / 86_400_000)
  if (diff === 0) return t('dashboard.today')
  if (diff === 1) return t('common.yesterday')
  if (d.getFullYear() === new Date().getFullYear()) return dayFmt().format(d)
  return dayYearFmt().format(d)
}

export function threadWhen(iso: string): string {
  return formatRelative(iso)
}
