import { t } from '../i18n'
import type { OverviewPlot, PlotStatus } from '../api'
import { formatHa, formatInt, STATUS_COLOR, STATUS_LABEL } from '../lib/status'
import { CropArt, CROP_LABELS, resolveCrop } from './art/crops'
import { EmptyState } from './EmptyState'
import { AquaEstimate, EnteredBy } from './EnteredBy'

const severity: Record<PlotStatus, number> = {
  ok: 0, no_data: 1, rain_wait: 2, dry: 3, tank_low: 4, critical: 5,
}

export function PlotStatusChip({ status }: { status: PlotStatus }) {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-cream-deep px-2 py-0.5 text-[11px] leading-tight text-ink">
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function DashboardPlants({ plots, onSelect }: { plots: OverviewPlot[]; onSelect: (id: number) => void }) {
  const groups = new Map<string, OverviewPlot[]>()
  for (const plot of plots) {
    const crop = plot.defaulted_fields?.includes('crop') ? '' : plot.crop.trim().toLowerCase()
    const kind = resolveCrop(crop)
    const key = kind === 'generic' ? crop : kind
    const members = groups.get(key)
    if (members) members.push(plot)
    else groups.set(key, [plot])
  }

  if (!groups.size) return <EmptyState text={t('dashboard.noCrops')} />

  return (
    <ul className="grid gap-3">
      {[...groups].map(([crop, members]) => {
        const kind = resolveCrop(crop)
        const label = !crop ? t('plots.cropMissing') : kind === 'generic' ? members[0].crop_label : CROP_LABELS[kind]
        const measured = members.filter((plot) => !plot.defaulted_fields?.includes('area_m2') && Number.isFinite(plot.area_m2))
        const area = measured.reduce((sum, plot) => sum + plot.area_m2, 0)
        const worst = members.reduce((a, b) => severity[b.status] > severity[a.status] ? b : a)
        return (
          <li key={crop} data-card="" className="min-w-0 rounded-card border border-line bg-paper p-3">
            <div className="flex flex-wrap items-center gap-2">
              <CropArt crop={crop} size={48} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <h3 className="break-words font-serif text-lg leading-tight text-ink">{label}</h3>
                <p className="text-xs text-ink-soft">
                  {formatInt(members.length)} {members.length === 1 ? 'plot' : 'plots'}
                  {' · '}
                  {measured.length === 0 ? t('plots.areaMissing') : `${area > 10_000 ? `${formatHa(area, 4)} ha` : `${formatInt(area)} m²`}${measured.length < members.length ? ' recorded' : ''}`}
                </p>
              </div>
              <PlotStatusChip status={worst.status} />
              {worst.status !== 'no_data' ? <AquaEstimate record={worst} /> : null}
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {members.map((plot) => (
                <li key={plot.id} className="min-w-0 max-w-full">
                  <button type="button" onClick={() => onSelect(plot.id)} className="max-w-full break-words rounded-full border border-line bg-cream px-2.5 py-1 text-xs font-medium text-forest hover:border-forest">
                    {plot.name}
                  </button>
                  <EnteredBy record={plot} />
                </li>
              ))}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
