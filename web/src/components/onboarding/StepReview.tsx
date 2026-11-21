import { t } from '../../i18n'
import type { ReactNode } from 'react'
import type { Crop } from '../../api'
import { formatInt } from '../../lib/status'
import { irrigationLabel, SOIL_TYPES } from '../../lib/plotFields'
import { waterKindMeta } from '../water/kinds'
import { animalLabel, parseDecimal, type HerdDraft, type PlotDraft, type SketchDraft, type SourceDraft } from './model'

export function StepReview({
  farmName, governorate, farmArea, plots, sources, herds, description, sketch, crops,
}: {
  farmName: string
  governorate: string
  farmArea: string
  plots: PlotDraft[]
  sources: SourceDraft[]
  herds: HerdDraft[]
  description: string
  sketch: SketchDraft | null
  crops: Crop[]
}) {
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 })
  const measurements = [
    { key: 'capacity', label: 'capacity', unit: 'L' },
    { key: 'level', label: t('water.nowLevel'), unit: 'L' },
    { key: 'refill', label: t('water.dailySupply'), unit: 'L/day' },
  ] as const

  return (
    <dl className="space-y-3 rounded-card border border-line bg-white p-4 text-sm">
      <Row label={t('onboarding.farm')}>{farmName.trim()}</Row>
      <Row label={t('common.governorate')}>{governorate}</Row>
      <Row label={t('farm.area')}>{farmArea.trim() ? `${number.format(parseDecimal(farmArea))} ha` : t('common.notRecorded')}</Row>
      <Row label={t('onboarding.fields')}>
        {plots.length ? (
          <ul className="space-y-1">
            {plots.map((plot) => {
              const crop = crops.find((item) => item.id === plot.crop)?.label ?? plot.crop
              const soil = SOIL_TYPES.find((item) => item.id === plot.soil_type)?.label
              return (
                <li key={plot.key}>
                  {crop} · {number.format(parseDecimal(plot.area))} {plot.unit === 'ha' ? 'ha' : 'm²'}
                  {plot.irrigation ? ` · ${irrigationLabel(plot.irrigation)}` : ''}
                  {soil ? ` · ${soil}` : ''}
                </li>
              )
            })}
          </ul>
        ) : t('common.none')}
      </Row>
      <Row label={t('water.sources')}>
        {sources.length ? (
          <ul className="space-y-1">
            {sources.map((source) => {
              const kind = waterKindMeta(source.kind).label
              return <li key={source.key}>
                {source.name.trim() ? `${source.name.trim()} (${kind})` : kind}
                {measurements.map(({ key, label, unit }) => source[key].trim()
                  ? ` · ${number.format(parseDecimal(source[key]))} ${unit} ${label}`
                  : '')}
              </li>
            })}
          </ul>
        ) : t('common.none')}
      </Row>
      <Row label={t('water.animals')}>
        {herds.length ? (
          <ul className="space-y-1">
            {herds.map((herd) => (
              <li key={herd.species}>
                {animalLabel(herd.species)} · {formatInt(parseDecimal(herd.count))}
                {herd.place.trim() ? ` · ${herd.place.trim()}` : ''}
              </li>
            ))}
          </ul>
        ) : t('common.none')}
      </Row>
      {description.trim() ? <Row label={t('common.about')}><span className="whitespace-pre-wrap">{description.trim()}</span></Row> : null}
      {sketch ? <Row label={t('dashboard.drawing')}>{sketch.name}</Row> : null}
    </dl>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="mt-0.5 break-words text-ink">{children}</dd>
    </div>
  )
}
