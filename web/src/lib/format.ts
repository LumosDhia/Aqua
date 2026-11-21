import { t } from '../i18n'
import { formatInt } from './status'

const m3Fmt = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const m3One = new Intl.NumberFormat('en', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
const tndFmt = new Intl.NumberFormat('en', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function litresLabel(n: number): string {
  return `${formatInt(n)} L`
}

export function cubicMetresLabel(litres: number): string | null {
  if (litres < 1000) return null
  return `${m3Fmt.format(litres / 1000)} m³`
}

export function litresAsM3(litres: number): string {
  return m3One.format(litres / 1000)
}

export function formatTnd(n: number): string {
  return `${tndFmt.format(n)} TND`
}

export function tndPerM3(n: number): string {
  return t('market.pricePerVolume', { price: tndFmt.format(n) })
}
