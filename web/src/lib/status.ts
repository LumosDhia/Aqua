import { t, activeLocale } from '../i18n'
import type { PlotStatus } from '../api'

export const STATUS_LABEL: Record<PlotStatus, string> = {
  get ok() { return t('dashboard.healthy') },
  get dry() { return t('dashboard.needsWater') },
  get critical() { return t('dashboard.veryDry') },
  get rain_wait() { return t('dashboard.waitingRain') },
  get tank_low() { return t('dashboard.lowTank') },
  get no_data() { return t('common.noData') },
}

export const STATUS_COLOR: Record<PlotStatus, string> = {
  ok: '#7cb069',
  dry: '#d4a054',
  critical: '#c23b2e',
  rain_wait: '#2f7a6b',
  tank_low: '#e07a3d',
  no_data: '#8a8478',
}

export const STATUS_ORDER: PlotStatus[] = [
  'ok',
  'dry',
  'critical',
  'rain_wait',
  'tank_low',
  'no_data',
]

const CROP_COLORS: Record<string, string> = {
  tomatoes: '#c23b2e',
  tomato: '#c23b2e',
  olives: '#4a9b88',
  olive: '#4a9b88',
  wheat: '#d4a054',
  peppers: '#c45c26',
  pepper: '#c45c26',
  citrus: '#e8c58a',
  dates: '#8b5a2b',
  date: '#8b5a2b',
}

const CROP_PALETTE = [
  '#7cb069',
  '#2f7a6b',
  '#d4a054',
  '#c23b2e',
  '#4a9b88',
  '#24604e',
  '#e8c58a',
  '#1b4d3e',
]

function hashKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) >>> 0
  return h
}

export function cropColor(crop: string): string {
  const key = crop.toLowerCase()
  const named = CROP_COLORS[key]
  if (named) return named
  return CROP_PALETTE[hashKey(key) % CROP_PALETTE.length]
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ]
}

export function moistureColor(pct: number | null): string {
  if (pct == null) return '#8a8478'
  const t = Math.min(1, Math.max(0, pct / 100))
  const a = hexToRgb('#d4a054')
  const b = hexToRgb('#2f7a6b')
  const r = Math.round(a[0] + (b[0] - a[0]) * t)
  const g = Math.round(a[1] + (b[1] - a[1]) * t)
  const bl = Math.round(a[2] + (b[2] - a[2]) * t)
  return `rgb(${r} ${g} ${bl})`
}

export function isAttention(status: PlotStatus): boolean {
  return status !== 'ok'
}

export function needsWater(status: PlotStatus): boolean {
  return status === 'dry' || status === 'critical' || status === 'tank_low'
}

const intFmt = new Intl.NumberFormat('en')
const oneDec = new Intl.NumberFormat('en', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

export function formatInt(n: number): string {
  return intFmt.format(Math.round(n))
}

export function formatHa(areaM2: number, maximumFractionDigits = 1): string {
  if (maximumFractionDigits === 1) return oneDec.format(areaM2 / 10_000)
  return (areaM2 / 10_000).toLocaleString('en', { maximumFractionDigits })
}

export function formatRelative(iso: string | null): string {
  if (!iso) return t('common.noReading')
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return t('common.noReading')
  const sec = Math.round((Date.now() - then) / 1000)
  const rtf = new Intl.RelativeTimeFormat(activeLocale(), { numeric: 'auto' })
  const abs = Math.abs(sec)
  if (abs < 60) return rtf.format(-sec, 'second')
  const min = Math.round(sec / 60)
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute')
  const hr = Math.round(min / 60)
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour')
  const day = Math.round(hr / 24)
  return rtf.format(-day, 'day')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]?.[0] ?? ''
    const b = parts[1]?.[0] ?? ''
    return (a + b).toUpperCase()
  }
  return name.trim().slice(0, 2).toUpperCase() || '?'
}

export function roleLabel(role: string): string {
  if (role === 'owner') return t('shell.owner')
  if (role === 'manager') return t('shell.manager')
  if (role === 'technician') return t('shell.technician')
  if (role === 'viewer') return t('shell.viewer')
  if (role === 'admin') return t('shell.admin')
  return role
}
