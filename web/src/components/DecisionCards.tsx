import { t, activeLocale } from '../i18n'
import { useState } from 'react'
import { CloudRain, Droplets, Sprout } from 'lucide-react'
import { ApiError, api, canDecide, type DecisionResult, type OverviewDecision, type OverviewPlot } from '../api'
import { formatRelative } from '../lib/status'
import { AquaEstimate } from './EnteredBy'

const day = () => new Intl.DateTimeFormat(activeLocale(), { timeZone: 'Africa/Tunis', dateStyle: 'short' })
const actions = {
  irrigate: { get label() { return t('farm.irrigate') }, icon: Droplets },
  light: { get label() { return t('dashboard.lightWater') }, icon: Droplets },
  wait: { get label() { return t('dashboard.waitToWater') }, icon: CloudRain },
  skip: { get label() { return t('dashboard.noWaterNeeded') }, icon: Sprout },
}

export function DecisionCards({
  decisions, plots, role, onSelectPlot, onRefresh,
}: {
  decisions: OverviewDecision[]
  plots: OverviewPlot[]
  role: string
  onSelectPlot: (id: number) => void
  onRefresh: () => void
}) {
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<DecisionResult | null>(null)
  const byId = new Map(plots.map((plot) => [plot.id, plot]))
  const recent = new Map<number, OverviewDecision>()
  const today = day().format(Date.now())
  for (const decision of decisions) {
    const time = Date.parse(decision.ts)
    const plot = byId.get(decision.plot_id)
    if (!plot || plot.soil_moisture == null || plot.defaulted_fields?.some((field) => field === 'crop' || field === 'area_m2')
      || !Number.isFinite(time) || day().format(time) !== today) continue
    const previous = recent.get(decision.plot_id)
    if (!previous || Date.parse(previous.ts) < time) recent.set(decision.plot_id, decision)
  }
  const rows = [...recent.values()].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
  const allowed = canDecide(role)
  const readyPlot = plots.find((plot) => plot.soil_moisture != null
    && !plot.defaulted_fields?.some((field) => field === 'crop' || field === 'area_m2'))

  async function run(id: number) {
    if (!allowed || busy != null) return
    setBusy(id)
    setError('')
    setResult(null)
    try {
      setResult(await api.decide(id))
      onRefresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('dashboard.adviceError'))
    } finally {
      setBusy(null)
    }
  }

  function actionButton(plot: OverviewPlot, label: string) {
    return (
      <button
        type="button"
        disabled={!allowed || busy != null}
        title={allowed ? undefined : t('dashboard.refreshPermission')}
        aria-label={`${label} for ${plot.name}`}
        onClick={() => void run(plot.id)}
        className="shrink-0 rounded-full bg-forest-deep px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
      >
        {busy === plot.id ? t('notifications.checking') : label}
      </button>
    )
  }

  return (
    <section data-card="" aria-labelledby="dashboard-today" className="shrink-0 rounded-card border border-line bg-cream px-3 py-2">
      <h2 id="dashboard-today" className="font-serif text-lg leading-tight text-ink">{t('dashboard.today')}</h2>
      {rows.length ? (
        <ul className="page-scroll mt-1 max-h-32 divide-y divide-line px-0.5 lg:max-h-24">
          {rows.map((decision) => {
            const plot = byId.get(decision.plot_id)
            const action = actions[decision.action]
            if (!plot || !action) return null
            const Icon = action.icon
            return (
              <li key={decision.plot_id} className="flex items-center gap-2 py-1.5">
                <Icon size={15} className="shrink-0 text-forest" aria-hidden />
                <div className="min-w-0 flex-1">
                  <button type="button" className="break-words text-start text-sm leading-tight text-forest hover:underline" onClick={() => onSelectPlot(plot.id)}>
                    {action.label} · {plot.name}
                  </button>
                  <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-soft">
                    <time dateTime={decision.ts} title={decision.why}>{formatRelative(decision.ts)}</time>
                    <AquaEstimate record={decision} note={t('estimates.watering')} />
                  </p>
                </div>
                {actionButton(plot, t('dashboard.refreshAdvice'))}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5 text-sm text-ink-soft">
          <p>{readyPlot ? t('dashboard.noAdvice') : t('dashboard.adviceHelp')}</p>
          {readyPlot ? actionButton(readyPlot, t('dashboard.getAdvice')) : null}
        </div>
      )}
      <div aria-live="polite">
        {result ? <p className="mt-1 text-xs text-ink-soft">{result.why} <AquaEstimate record={result} /></p> : null}
      </div>
      {error ? <p role="alert" className="mt-1 text-xs text-hanko">{error}</p> : null}
    </section>
  )
}
