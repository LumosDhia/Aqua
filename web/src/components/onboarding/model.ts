import { t } from '../../i18n'
import {
  type Irrigation,
  type LivestockSpeciesId,
  type MarketGovernorate,
  type OnboardingHerd,
  type OnboardingPlot,
  type PlotBox,
  type OnboardingSource,
  type SoilType,
  type WaterKind,
} from '../../api'

export const NAME_MIN = 2
export const NAME_MAX = 120
export const DESC_MAX = 2000
export const AREA_M2_MIN = 1
export const AREA_M2_MAX = 10_000_000
export const PLOT_MAX = 30
export const SOURCE_MAX = 12
export const HERD_MAX = 11
export const FARM_AREA_MAX_HA = 100_000
export const HERD_COUNT_MAX = 1_000_000
export const HERD_PLACE_MAX = 60
const WATER_MAX_L = 1_000_000_000

export const WIZARD_STEPS = [
  {
    id: 'farm',
    get name() { return t('onboarding.farm') },
    get title() { return t('onboarding.farmTitle') },
    get helper() { return t('onboarding.farmHelp') },
  },
  {
    id: 'about',
    get name() { return t('common.about') },
    get title() { return t('onboarding.aboutFarm') },
    get helper() { return t('onboarding.aboutHelp') },
  },
  {
    id: 'crops',
    get name() { return t('plots.crops') },
    get title() { return t('onboarding.cropsTitle') },
    get helper() { return t('onboarding.cropsHelp') },
  },
  {
    id: 'water',
    get name() { return t('shell.water') },
    get title() { return t('onboarding.water') },
    get helper() { return t('onboarding.waterHelp') },
  },
  {
    id: 'animals',
    get name() { return t('water.animals') },
    get title() { return t('water.animals') },
    get helper() { return t('onboarding.animalHelp') },
  },
  {
    id: 'review',
    get name() { return t('common.review') },
    get title() { return t('common.review') },
    get helper() { return t('onboarding.reviewHelp') },
  },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

export type AreaUnit = 'm2' | 'ha'

export type PlotDraft = {
  key: string
  crop: string
  name: string
  area: string
  unit: AreaUnit
  irrigation: Irrigation | ''
  soil_type: SoilType | ''
  /** Where the drawing put this field (fractions 0..1); set only for fields read from a drawing. */
  box?: PlotBox
  /** True while the field came from reading the drawing or description, so a new reading can replace it. */
  fromRead?: boolean
}

export type SourceDraft = {
  key: string
  kind: WaterKind
  name: string
  capacity: string
  level: string
  refill: string
}

export type HerdDraft = {
  species: LivestockSpeciesId
  count: string
  place: string
  box?: PlotBox
  fromRead?: boolean
}

export type AboutMode = 'describe' | 'draw'

export type SketchDraft = {
  data: string
  previewUrl: string
  name: string
}

export const ANIMAL_KINDS: { id: LivestockSpeciesId; label: string }[] = [
  { id: 'dairy_cow', get label() { return t('onboarding.dairyCows') } },
  { id: 'beef_cattle', get label() { return t('onboarding.beefCattle') } },
  { id: 'sheep', get label() { return t('onboarding.sheep') } },
  { id: 'goat', get label() { return t('onboarding.goats') } },
  { id: 'horse', get label() { return t('onboarding.horses') } },
  { id: 'donkey', get label() { return t('onboarding.donkeys') } },
  { id: 'camel', get label() { return t('onboarding.camels') } },
  { id: 'pig', get label() { return t('onboarding.pigs') } },
  { id: 'chicken', get label() { return t('onboarding.chickens') } },
  { id: 'turkey', get label() { return t('onboarding.turkeys') } },
  { id: 'rabbit', get label() { return t('onboarding.rabbits') } },
]

export function animalLabel(id: LivestockSpeciesId): string {
  return ANIMAL_KINDS.find((kind) => kind.id === id)?.label ?? id
}

export function parseDecimal(raw: string): number {
  const text = raw.trim()
  return /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text) ? Number(text.replace(',', '.')) : Number.NaN
}

export function areaToM2(area: string, unit: AreaUnit): number | null {
  const n = parseDecimal(area)
  const m2 = unit === 'ha' ? Number((n * 10_000).toPrecision(15)) : n
  return m2 >= AREA_M2_MIN && m2 <= AREA_M2_MAX ? m2 : null
}

export function convertArea(value: string, from: AreaUnit, to: AreaUnit): string {
  const n = parseDecimal(value)
  if (from === to || !Number.isFinite(n)) return value
  const converted = to === 'm2' ? n * 10_000 : n / 10_000
  return String(Number(converted.toPrecision(15)))
}

export function plotCropError(row: PlotDraft): string {
  return row.crop ? '' : t('onboarding.cropRequired')
}

export function plotAreaError(row: PlotDraft): string {
  if (!row.area.trim()) return t('onboarding.areaRequired')
  if (areaToM2(row.area, row.unit) != null) return ''
  return row.unit === 'ha'
    ? t('onboarding.areaHaRange')
    : t('onboarding.areaM2Range')
}

export function farmNameError(name: string): string {
  const length = Array.from(name.trim()).length
  if (length < NAME_MIN) return t('onboarding.farmNameMinimum')
  if (length > NAME_MAX) return t('onboarding.farmNameMaximum')
  return ''
}

export function governorateError(value: string, options: MarketGovernorate[]): string {
  return options.some((option) => option.name === value) ? '' : t('common.governorateInvalid')
}

export function farmAreaError(raw: string): string {
  if (!raw.trim()) return ''
  const num = parseDecimal(raw)
  return num >= 0.0001 && num <= FARM_AREA_MAX_HA
    ? ''
    : t('onboarding.farmAreaRange')
}

export function parseLitres(raw: string): number | null {
  return raw.trim() ? parseDecimal(raw) : null
}

function litresError(value: number | null): string {
  return value == null || (value >= 0 && value <= WATER_MAX_L)
    ? ''
    : t('onboarding.volumeRange')
}

export function sourceErrors(row: SourceDraft) {
  const capacity = parseLitres(row.capacity)
  const level = parseLitres(row.level)
  const refill = parseLitres(row.refill)
  const capacityError = litresError(capacity)
  const levelError = litresError(level)
  const aboveCapacity = !capacityError && capacity != null && level != null && level > capacity
  return {
    capacity: capacityError,
    level: levelError || (aboveCapacity ? t('water.levelAboveCapacity') : ''),
    refill: litresError(refill),
  }
}

export function herdError(row: HerdDraft): string {
  const count = parseDecimal(row.count)
  if (!Number.isInteger(count) || count < 1) return t('onboarding.animalMinimum')
  if (count > HERD_COUNT_MAX) return t('onboarding.animalMaximum')
  return ''
}

export function blankPlot(key: string, crop: string): PlotDraft {
  return { key, crop, name: '', area: '', unit: 'm2', irrigation: '', soil_type: '' }
}

export function blankSource(key: string, kind: WaterKind): SourceDraft {
  return { key, kind, name: '', capacity: '', level: '', refill: '' }
}

export function toOnboardingPlots(rows: PlotDraft[]): OnboardingPlot[] {
  return rows.flatMap((row) => {
    const area = areaToM2(row.area, row.unit)
    if (area == null) return []
    return [{
      name: row.name.trim(),
      crop: row.crop,
      area_m2: area,
      irrigation: row.irrigation,
      soil_type: row.soil_type,
      ...(row.box ? { box: row.box } : {}),
    }]
  })
}

export function toOnboardingSources(rows: SourceDraft[]): OnboardingSource[] {
  return rows.map((row) => ({
    kind: row.kind,
    name: row.name.trim(),
    capacity_l: parseLitres(row.capacity),
    level_l: parseLitres(row.level),
    refill_l_per_day: parseLitres(row.refill),
  }))
}

export function toOnboardingHerds(rows: HerdDraft[]): OnboardingHerd[] {
  return rows.map((row) => ({ species: row.species, count: parseDecimal(row.count), place: row.place.trim(), ...(row.box ? { box: row.box } : {}) }))
}
