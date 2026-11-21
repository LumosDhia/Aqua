import { t } from '../i18n'
import { isIrrigation, isSoilType, type Irrigation, type SoilType } from '../api'

export const SOIL_TYPES: { id: SoilType; label: string }[] = [
  { id: 'sand', get label() { return t('soil.sand') } },
  { id: 'sandy_loam', get label() { return t('soil.sandyLoam') } },
  { id: 'loam', get label() { return t('soil.loam') } },
  { id: 'clay_loam', get label() { return t('soil.clayLoam') } },
  { id: 'clay', get label() { return t('soil.clay') } },
]

export const IRRIGATION_TYPES = [
  { id: 'drip', get label() { return t('plots.drip') } },
  { id: 'sprinkler', get label() { return t('plots.sprinkler') } },
  { id: 'flood', get label() { return t('plots.flood') } },
] as const

export function parseSoilType(value: string): SoilType {
  return isSoilType(value) ? value : 'loam'
}

export function parseIrrigation(value: string): Irrigation {
  return isIrrigation(value) ? value : 'drip'
}

export function irrigationLabel(value: string): string {
  const hit = IRRIGATION_TYPES.find((i) => i.id === value)
  if (hit) return hit.label
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}
