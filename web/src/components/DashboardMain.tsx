import { t, activeLocale } from '../i18n'
import { useRef, type ReactNode } from 'react'
import { CircleAlert, CloudSun, Droplet, Droplets, TrendingDown } from 'lucide-react'
import { canManageDevices, canManageWater, type Forecast, type Overview, type OverviewPlot, type WaterSource, type WaterSummary } from '../api'
import { formatInt, formatRelative, isAttention, moistureColor } from '../lib/status'
import { VIEW_HREF } from '../lib/view'
import { CropArt } from './art/crops'
import { PlotStatusChip } from './DashboardPlants'
import { DecisionCards } from './DecisionCards'
import { EmptyState } from './EmptyState'
import { AquaEstimate, EnteredBy } from './EnteredBy'
import { LiveNumber, StatTile } from './StatTile'
import { WaterOutlookCard } from './WaterOutlookCard'

const farmDate = () => new Intl.DateTimeFormat(activeLocale(), {
  timeZone: 'Africa/Tunis', weekday: 'long', month: 'long', day: 'numeric',
})

function Greeting({ farmName }: { farmName: string }) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
      <div className="min-w-0">
        <h2 className="break-words font-serif text-2xl leading-tight text-ink">{t('dashboard.welcome', { name: farmName })}</h2>
        <p className="text-xs text-ink-soft">{farmDate().format(new Date())}</p>
      </div>
    </header>
  )
}

function MoistureSparkline({ values }: { values: (number | null)[] }) {
  const points = values.flatMap((value, i) => value == null ? [] : [{
    i, x: 2 + i / 23 * 92, y: 18 - Math.max(0, Math.min(value, 100)) * 0.16,
  }])
  if (!points.length) return null
  return (
    <svg viewBox="0 0 96 20" role="img" aria-label={t('dashboard.moistureHistory')} className="mt-0.5 h-5 w-full text-forest motion-safe:animate-[dash-sparkline-in_450ms_ease-out]" preserveAspectRatio="none">
      {points.map((point, index) => {
        const prev = points[index - 1]
        return prev && prev.i === point.i - 1
          ? <line key={point.i} x1={prev.x} y1={prev.y} x2={point.x} y2={point.y} stroke="currentColor" strokeWidth="1.5" />
          : <circle key={point.i} cx={point.x} cy={point.y} r="1.5" fill="currentColor" />
      })}
    </svg>
  )
}

function PlotCard({ plot, onSelect }: { plot: OverviewPlot; onSelect: (id: number) => void }) {
  const moisture = plot.soil_moisture
  const crop = plot.defaulted_fields?.includes('crop') ? '' : plot.crop
  return (
    <article data-card="" className="relative min-w-0 rounded-card border border-line bg-cream p-2.5 hover:border-forest">
      <button type="button" className="flex w-full min-w-0 items-start gap-2 rounded-md text-start after:absolute after:inset-0 after:rounded-card" onClick={() => onSelect(plot.id)}>
        <CropArt crop={crop} size={38} animate={false} className="shrink-0" />
        <span className="min-w-0">
          <span className="block break-words font-serif text-base leading-tight text-ink">{plot.name}</span>
          <span className="block break-words text-xs text-ink-soft">{crop ? plot.crop_label : t('plots.cropMissing')}</span>
        </span>
      </button>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-1">
        <PlotStatusChip status={plot.status} />
        <span className="text-xs text-ink-soft"><LiveNumber value={moisture} unit="%" /></span>
      </div>
      {moisture != null ? (
        <div role="meter" aria-label={t('dashboard.moisture')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.max(0, moisture))} className="mt-1 h-1.5 rounded-full bg-cream-deep">
          <div className="h-full rounded-full motion-safe:transition-[width]" style={{
            width: `${Math.min(100, Math.max(0, moisture))}%`, backgroundColor: moistureColor(moisture),
          }} />
        </div>
      ) : null}
      {plot.last_ts ? (
        <p className="mt-1 text-[11px] text-ink-soft">{t('dashboard.lastReading')}{' '} <time dateTime={plot.last_ts}>{formatRelative(plot.last_ts)}</time></p>
      ) : null}
      {plot.reading_source === 'manual' ? <EnteredBy record={{ entered_by: plot.reading_entered_by }} verb="Recorded" /> : null}
    </article>
  )
}

type DashboardMainProps = {
  overview: Overview
  water: { sources: WaterSource[]; summary: WaterSummary } | null
  forecast: Forecast | null
  history: (number | null)[] | null
  historyFailed: boolean
  waterLoading: boolean
  weatherLoading: boolean
  contextError: string
  emptyDevices: boolean
  controls: ReactNode
  search: string
  attentionOnly: boolean
  onAttention: () => void
  onSelect: (id: number) => void
  onAdd?: () => void
  onRefresh: () => void
}

export function DashboardMain({
  overview, water, forecast, history, historyFailed, contextError,
  waterLoading, weatherLoading, emptyDevices, controls, search, attentionOnly, onAttention, onSelect, onAdd, onRefresh,
}: DashboardMainProps) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { plots, my_role: role, decisions, weekly_savings: savings } = overview
  const measured = plots.filter((plot) => plot.soil_moisture != null && Number.isFinite(plot.soil_moisture))
  const moisture = measured.length ? measured.reduce((sum, plot) => sum + (plot.soil_moisture ?? 0), 0) / measured.length : null
  const latest = measured.reduce<string | null>((current, plot) => {
    if (!plot.last_ts || !Number.isFinite(Date.parse(plot.last_ts))) return current
    return !current || Date.parse(plot.last_ts) > Date.parse(current) ? plot.last_ts : current
  }, null)
  const recorded = water?.sources.filter((source) => source.level_recorded === true || (source.level_recorded == null && source.level_l > 0)) ?? []
  const stored = recorded.length ? water?.summary.total_stored_l ?? null : null
  const attention = plots.filter((plot) => isAttention(plot.status)).length
  const currentHour = forecast?.hourly.find((hour) => hour.time.slice(0, 13) === forecast.current.time.slice(0, 13))
  const rain = currentHour?.rain_probability
  const q = search.trim().toLocaleLowerCase()
  const shown = plots.filter((plot) =>
    (!attentionOnly || isAttention(plot.status))
    && (!q || [plot.name, plot.crop, plot.crop_label].some((value) => value.toLocaleLowerCase().includes(q))),
  )

  function openAttention() {
    onAttention()
    heading.current?.focus({ preventScroll: true })
    heading.current?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="dashboard-main-scroll min-h-0 min-w-0">
      <div className="flex min-w-0 flex-col gap-3 lg:h-full">
        <Greeting farmName={overview.farm.name} />
        <section aria-label={t('dashboard.overview')} aria-live="polite" className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-5">
          <StatTile label={t('dashboard.moisture')} icon={Droplet} value={moisture} unit="%">
            {measured.length ? <>{formatInt(measured.length)} of {formatInt(plots.length)} plots{latest ? <> · <time dateTime={latest}>{formatRelative(latest)}</time></> : null}</> : null}
            {history ? <MoistureSparkline values={history} /> : null}
            {historyFailed ? <span className="block">{t('dashboard.partialHistory')}</span> : null}
            {emptyDevices ? (
              <a href={VIEW_HREF.devices} title={canManageDevices(role) ? undefined : t('dashboard.boardPermission')} className="block font-medium text-forest underline">
                {canManageDevices(role) ? t('dashboard.connectBoard') : t('dashboard.viewDevices')}
              </a>
            ) : null}
          </StatTile>
          <StatTile label={t('dashboard.waterStored')} icon={Droplets} loading={waterLoading} value={stored} unit=" L">
            {recorded.length === 1 ? <EnteredBy record={{ entered_by: recorded[0].level_entered_by }} verb="Recorded" /> : null}
            {recorded.length > 0 && water && recorded.length < water.sources.length ? <span className="block">{formatInt(recorded.length)} of {formatInt(water.sources.length)} sources</span> : null}
            <a href={VIEW_HREF.water} className="block font-medium text-forest underline">
              {stored == null && canManageWater(role) ? t('dashboard.recordWater') : t('water.myWater')}
            </a>
          </StatTile>
          <StatTile label={t('dashboard.weatherNow')} icon={CloudSun} loading={weatherLoading} value={forecast?.current.temperature ?? null} unit="°C">
            {forecast ? <>
              <span className="block">{rain == null ? t('dashboard.rainChanceMissing') : <><LiveNumber value={rain} unit="%" /> {' '}{t('dashboard.rainChanceCaption')}</>}</span>
              {forecast.stale ? <span className="block">{t('weather.lastForecast')}</span> : null}
              <AquaEstimate record={forecast} />
            </> : null}
          </StatTile>
          <StatTile label={t('dashboard.savedWater')} icon={TrendingDown} value={savings?.litres ?? null} unit=" L">
            {savings?.litres != null ? <AquaEstimate record={savings} /> : null}
          </StatTile>
          <StatTile label={t('dashboard.needsAttention')} icon={CircleAlert} value={attention} onClick={openAttention}>
            {attention === 1 ? 'plot' : 'plots'}
          </StatTile>
        </section>
        {contextError ? (
          <p className="flex shrink-0 flex-wrap items-center justify-between gap-1 text-xs text-hanko" role="alert">
            {contextError} <button type="button" onClick={onRefresh} className="font-medium underline">{t('common.retry')}</button>
          </p>
        ) : null}
        {controls}
        <DecisionCards decisions={decisions} plots={plots} role={role} onSelectPlot={onSelect} onRefresh={onRefresh} />
        <section aria-labelledby="dashboard-plots" className="flex min-h-0 flex-col gap-2 lg:min-h-32 lg:flex-1">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <h2 id="dashboard-plots" ref={heading} tabIndex={-1} className="font-serif text-lg leading-tight text-ink">{t('dashboard.yourPlots')}</h2>
            {attentionOnly ? (
              <button type="button" onClick={onAttention} className="text-xs font-medium text-forest underline">{t('dashboard.showAllPlots')}</button>
            ) : null}
          </div>
          {shown.length ? (
            <ul className="grid grid-cols-1 content-start gap-3 p-0.5 sm:grid-cols-2 dashboard-plots-scroll lg:min-h-0 lg:flex-1 xl:grid-cols-3">
              {shown.map((plot) => <li className="min-w-0" key={plot.id}><PlotCard plot={plot} onSelect={onSelect} /></li>)}
            </ul>
          ) : (
            <EmptyState
              text={plots.length ? t('dashboard.noMatchingPlots') : t('plots.none')}
              action={!plots.length && onAdd ? { label: t('plots.add'), onClick: onAdd } : undefined}
            />
          )}
        </section>
        <WaterOutlookCard forecast={forecast} />
      </div>
    </div>
  )
}
