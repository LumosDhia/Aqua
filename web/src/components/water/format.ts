import { t, activeLocale } from '../../i18n'
import { cubicMetresLabel, litresLabel } from '../../lib/format'

export { cubicMetresLabel, litresLabel }

const preciseFmt = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const mmFmt = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function litresPrecise(n: number): string {
  return `${preciseFmt.format(n)} L`
}

export function formatMm(n: number): string {
  return `${mmFmt.format(n)} mm`
}

export function formatShortWeekday(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  if (!Number.isFinite(date.getTime())) return t('common.dateMissing')
  return new Intl.DateTimeFormat(activeLocale(), { weekday: 'short', timeZone: 'UTC' }).format(date)
}

export function signedBalance(n: number): { label: string; tone: 'leaf' | 'hanko' | 'mute' } {
  const tone = n > 0 ? 'leaf' : n < 0 ? 'hanko' : 'mute'
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const m3 = cubicMetresLabel(abs)
  return { label: `${sign}${m3 ?? litresLabel(abs)}`, tone }
}

export type HorizonId = 'today' | 'week' | 'month' | 'year'

export function horizonLitres(
  row: { today_l: number; week_l: number; month_l: number; year_l: number },
  horizon: HorizonId,
): number {
  if (horizon === 'today') return row.today_l
  if (horizon === 'week') return row.week_l
  if (horizon === 'month') return row.month_l
  return row.year_l
}

export function totalsLine(stored: number, refill: number): string {
  return t('water.storageAndRefill', { stored: litresLabel(stored), refill: litresLabel(refill) })
}

export function fillBarClass(pct: number): string {
  if (pct < 20) return 'bg-hanko'
  if (pct <= 40) return 'bg-ochre'
  return 'bg-leaf'
}

export function fillChip(pct: number): { label: string; className: string } | null {
  if (pct < 20) return { label: t('soil.low'), className: 'bg-hanko/10 text-hanko' }
  if (pct >= 95) return { label: t('water.full'), className: 'bg-leaf-soft/70 text-forest' }
  return null
}
