import { t, activeLocale, countLabel } from '../../i18n'
import {
  API_BASE,
  type MarketFulfilment,
  type MarketInquiryStatus,
  type MarketListing,
  type MarketListingBody,
  type MarketListingStatus,
  type MarketPriceMode,
  type WaterKind,
} from '../../api'
import { cubicMetresLabel, litresLabel, tndPerM3 } from '../../lib/format'
import { formatInt } from '../../lib/status'

const kmFmt = new Intl.NumberFormat('en', { maximumFractionDigits: 0 })
const dayFmt = () => new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'short' })
const dayYearFmt = () => new Intl.DateTimeFormat(activeLocale(), {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export const MARKET_SOURCES: { id: WaterKind; label: string }[] = [
  { id: 'well', get label() { return t('water.well') } },
  { id: 'borehole', get label() { return t('water.borehole') } },
  { id: 'rain_tank', get label() { return t('market.rainTank') } },
  { id: 'tank', get label() { return t('water.tank') } },
  { id: 'network', get label() { return t('market.publicNetwork') } },
  { id: 'canal', get label() { return t('water.canal') } },
]

const SOURCE_IDS = new Set<string>(MARKET_SOURCES.map((s) => s.id))

export function isMarketSource(value: string): value is WaterKind {
  return SOURCE_IDS.has(value)
}

export function sourceLabel(kind: WaterKind): string {
  return MARKET_SOURCES.find((s) => s.id === kind)?.label ?? kind
}

export function volumeAvailable(litres: number): string {
  const m3 = cubicMetresLabel(litres)
  if (m3) return `${m3} available`
  return `${litresLabel(litres)} available`
}

export function priceChip(mode: MarketPriceMode, price: number | null): string {
  if (mode === 'free') return t('market.free')
  if (mode === 'negotiable' || price == null) return t('market.priceRequest')
  return tndPerM3(price)
}

export function fulfilmentChips(
  fulfilment: MarketFulfilment,
  radius: number | null,
): string[] {
  const pickup = t('market.pickup')
  const delivery =
    radius != null ? t('market.deliveryLimit', { distance: formatInt(radius) }) : t('market.delivery')
  if (fulfilment === 'pickup') return [pickup]
  if (fulfilment === 'delivery') return [delivery]
  return [pickup, delivery]
}

export function fulfilmentText(
  fulfilment: MarketFulfilment,
  radius: number | null,
): string {
  const delivery =
    radius != null ? t('market.deliveryLimit', { distance: formatInt(radius) }) : t('market.delivery')
  if (fulfilment === 'pickup') return t('market.pickupFarm')
  if (fulfilment === 'delivery') return delivery
  return t('market.pickupAndDelivery', { delivery: delivery })
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

export function untilChip(iso: string | null): string | null {
  if (!iso) return null
  const d = parseDate(iso)
  if (!d) return null
  return t('common.untilDate', { date: dayFmt().format(d) })
}

export function formatDay(iso: string): string {
  const d = parseDate(iso)
  if (!d) return iso
  return dayYearFmt().format(d)
}

export function dateInputValue(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function distanceLine(km: number | null): string | null {
  if (km == null) return null
  return t('market.farmDistance', { distance: kmFmt.format(km) })
}

export function osmHref(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=12/${lat}/${lon}`
}

export function listingStatusMeta(status: MarketListingStatus): {
  label: string
  className: string
} {
  if (status === 'active') {
    return { label: t('common.active'), className: 'bg-leaf-soft/70 text-forest' }
  }
  if (status === 'paused') {
    return { label: t('market.paused'), className: 'bg-ochre-soft/60 text-ink' }
  }
  return { label: t('common.closed'), className: 'bg-cream text-ink-soft' }
}

export function inquiryStatusMeta(
  status: MarketInquiryStatus,
  asSender: boolean,
): { label: string; className: string } {
  if (status === 'new') {
    return asSender
      ? { label: t('common.sent'), className: 'bg-teal/15 text-forest' }
      : { label: t('common.new'), className: 'bg-hanko/10 text-hanko' }
  }
  if (status === 'read') return { label: t('common.read'), className: 'bg-cream text-ink-soft' }
  if (status === 'accepted') {
    return { label: t('common.accepted'), className: 'bg-leaf-soft/70 text-forest' }
  }
  return { label: t('common.declined'), className: 'bg-hanko/10 text-hanko' }
}

export function listingsCount(n: number): string {
  return countLabel('market.listingCount', n)
}

export function inquiriesCount(n: number): string {
  return countLabel('market.inquiryCount', n)
}

export function photoSrc(url: string): string {
  if (/^https?:/i.test(url) || url.startsWith('data:')) return url
  return API_BASE + url
}

export function photoFilename(url: string): string {
  const clean = (url.split('?')[0] ?? url).replace(/\/+$/, '')
  const i = clean.lastIndexOf('/')
  return i >= 0 ? clean.slice(i + 1) : clean
}

export function listingToBody(listing: MarketListing): MarketListingBody {
  return {
    title: listing.title,
    description: listing.description,
    litres_available: listing.litres_available,
    price_mode: listing.price_mode,
    price_per_m3: listing.price_per_m3,
    water_source: listing.water_source,
    quality_notes: listing.quality_notes,
    fulfilment: listing.fulfilment,
    delivery_radius_km: listing.delivery_radius_km,
    available_from: listing.available_from,
    available_until: listing.available_until,
    governorate: listing.governorate,
    address_text: listing.address_text,
    lat: listing.lat,
    lon: listing.lon,
    photos: listing.photos.map(photoFilename),
    status: listing.status,
  }
}
