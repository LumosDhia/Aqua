import { t, activeLocale } from '../../i18n'
import { formatInt, formatRelative } from '../../lib/status'

const mmFmt = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function formatTemp(n: number): string {
  return formatInt(n)
}

export function formatMm(n: number): string {
  return mmFmt.format(n)
}

export function formatPct(n: number): string {
  return `${formatInt(n)}%`
}

export function formatKmh(n: number): string {
  return `${formatInt(n)} km/h`
}

export function formatUv(n: number): string {
  return mmFmt.format(n)
}

export function formatHourLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(activeLocale() + '-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

/** Forecast dates are plain calendar days (YYYY-MM-DD). Read them as local days so they never shift. */
function calendarDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function formatAlertDate(iso: string): string {
  const d = calendarDate(iso)
  if (!d) return iso
  return new Intl.DateTimeFormat(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
}

export function formatWeekday(iso: string): string {
  const d = calendarDate(iso)
  if (!d) return iso
  return new Intl.DateTimeFormat(activeLocale(), { weekday: 'short' }).format(d)
}

export function formatDayHeading(iso: string): { weekday: string; rest: string } {
  const d = calendarDate(iso)
  if (!d) return { weekday: iso, rest: '' }
  return {
    weekday: new Intl.DateTimeFormat(activeLocale(), { weekday: 'long' }).format(d),
    rest: new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'short' }).format(d),
  }
}

/** Today's calendar day (YYYY-MM-DD) in the farm's time zone, or the browser's when none is known. */
export function calendarToday(timeZone: string | null): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}),
    }).format(new Date())
    return parts
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function updatedLine(place: string, iso: string): string {
  const when = formatRelative(iso)
  return place ? t('weather.weatherUpdated', { location: place, time: when }) : t('weather.updated', { time: when })
}

export function isGoodWaterDay(day: { rain_probability: number | null; wind_max_kmh: number }): boolean {
  if (day.rain_probability == null) return false
  return day.rain_probability < 30 && day.wind_max_kmh < 25
}
