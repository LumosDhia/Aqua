import { t, countLabel } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { EmptyState } from '../EmptyState'
import { useEffect, useRef, useState } from 'react'
import {
  CircleCheck,
  Hourglass,
  Info,
  Pencil,
  TriangleExclamationPoint,
  type LucideIcon,
} from 'lucide-react'
import {
  ApiError,
  api,
  canAddPlot,
  canManageMarket,
  canManageWater,
  type WaterBalance,
  type WaterBalanceHorizon,
  type WaterBalancePlot,
  type WaterVerdictStatus,
} from '../../api'
import { farmWorkOnly } from '../../lib/farmWorkspace'
import { litresAsM3 } from '../../lib/format'
import { irrigationLabel } from '../../lib/plotFields'
import { formatHa, formatInt } from '../../lib/status'
import { VIEW_HREF, setMarketPrefill } from '../../lib/view'
import { DailyNeedChart } from './DailyNeedChart'
import {
  cubicMetresLabel,
  horizonLitres,
  litresLabel,
  signedBalance,
  type HorizonId,
} from './format'

const HORIZONS: { id: HorizonId; label: string }[] = [
  { id: 'today', get label() { return t('dashboard.today') } },
  { id: 'week', get label() { return t('common.days7') } },
  { id: 'month', get label() { return t('common.days30') } },
  { id: 'year', get label() { return t('cv.education.year') } },
]

const VERDICT_META: Record<
  WaterVerdictStatus,
  { chip: string; Icon: LucideIcon; card: string; chipClass: string; iconWrap: string }
> = {
  ok: {
    get chip() { return t('water.covered') },
    Icon: CircleCheck,
    card: 'border-leaf/40 bg-leaf-soft/50',
    chipClass: 'bg-leaf-soft/70 text-forest',
    iconWrap: 'bg-leaf text-white',
  },
  tight: {
    get chip() { return t('water.gettingTight') },
    Icon: Hourglass,
    card: 'border-ochre/40 bg-ochre/10',
    chipClass: 'bg-ochre-soft/60 text-ink',
    iconWrap: 'bg-ochre text-ink',
  },
  short: {
    get chip() { return t('water.runningShort') },
    Icon: TriangleExclamationPoint,
    card: 'border-hanko/30 bg-hanko/10',
    chipClass: 'bg-hanko/10 text-hanko',
    iconWrap: 'bg-hanko text-white',
  },
  no_sources: {
    get chip() { return t('water.noSourcesShort') },
    Icon: Info,
    card: 'border-line bg-cream',
    chipClass: 'bg-cream-deep text-ink-soft',
    iconWrap: 'bg-mute/25 text-ink',
  },
}

const BALANCE_TONE: Record<'leaf' | 'hanko' | 'mute', string> = {
  leaf: 'text-forest',
  hanko: 'text-hanko',
  mute: 'text-ink',
}

type NeedsTabProps = {
  farmId: number | null
  role: string
  account: { role: string }
  active: boolean
  revision: number
  onAddSources: () => void
  onManageAnimals: () => void
  onEditPlot: (plot: WaterBalancePlot) => void
  onAddPlot: () => void
}

export function NeedsTab({
  farmId,
  role,
  account,
  active,
  revision,
  onAddSources,
  onManageAnimals,
  onEditPlot,
  onAddPlot,
}: NeedsTabProps) {
  const canEdit = canAddPlot(role)
  const canList = canManageMarket(role) && !farmWorkOnly(account)
  const canAddAnimals = canManageWater(role) && farmId != null
  const [data, setData] = useState<WaterBalance | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [ready, setReady] = useState(false)
  const [tick, setTick] = useState(0)
  const [horizon, setHorizon] = useState<HorizonId>('week')
  const seqRef = useRef(0)

  useEffect(() => {
    setData(null)
    setReady(false)
    setLoadErr('')
    setHorizon('week')
  }, [farmId])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      if (farmId == null) {
        if (!cancelled && my === seqRef.current) {
          setData(null)
          setLoadErr('')
          setReady(true)
        }
        return
      }
      try {
        const next = await api.waterBalance(farmId)
        if (cancelled || my !== seqRef.current) return
        setData(next)
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        if (!isPoll) {
          setLoadErr(e instanceof ApiError ? e.message : t('water.needsLoadError'))
        }
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 300_000)
    return () => {
      cancelled = true
      seqRef.current += 1
      window.clearInterval(timer)
    }
  }, [active, farmId, revision, tick])

  function onRetry() {
    setLoadErr('')
    setReady(false)
    setData(null)
    setTick((n) => n + 1)
  }

  const empty = ready && !!data && data.plots.length === 0 && data.animals.length === 0
  const hideBody = Boolean(loadErr && !data && ready)

  if (!ready && !data) {
    return <NeedsSkeleton />
  }

  if (hideBody) {
    return (
      <ErrorBanner
        message={loadErr}
        onRetry={onRetry}
      />
    )
  }

  if (!data || empty) {
    return (
      <EmptyState
        text={t('water.needsStart')}
        action={canEdit && farmId != null
          ? { label: t('plots.add'), onClick: onAddPlot }
          : { label: t('plots.add'), disabledReason: farmId == null ? t('common.selectFarm') : t('dashboard.noFarmAccess') }}
      />
    )
  }

  const slice = data.horizons[horizon]
  const supplyUnavailable = slice.supply_estimate_available !== true || data.supply.measurements_incomplete === true
  const plots = [...data.plots].sort((a, b) => {
    const d = horizonLitres(b, horizon) - horizonLitres(a, horizon)
    if (d !== 0) return d
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  return (
    <div className="space-y-4">
      {loadErr ? <ErrorBanner message={loadErr} onRetry={onRetry} /> : null}

      <AquaEstimate record={data} note={t('estimates.waterNeeds')} />

      {supplyUnavailable ? (
        <p className="rounded-card border border-line bg-cream p-4 text-sm text-ink">
          {t('water.needsHint')}
          <button type="button" onClick={onAddSources} className="ms-2 text-forest underline">{t('water.myWater')}</button>
        </p>
      ) : <VerdictCard verdict={data.verdict} onAddSources={onAddSources} />}
      {canManageMarket(role) && !supplyUnavailable && data.verdict.surplus_l_week > 0 ? (
        <SurplusBanner litres={data.verdict.surplus_l_week} canList={canList} />
      ) : null}

      <div
        role="group"
        aria-label={t('water.timeRange')}
        className="inline-flex max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
      >
        {HORIZONS.map((h) => (
          <button
            key={h.id}
            type="button"
            aria-pressed={horizon === h.id}
            onClick={() => setHorizon(h.id)}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              horizon === h.id ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {h.label}
          </button>
        ))}
      </div>

      <HorizonTiles slice={slice} supplyUnavailable={supplyUnavailable} />

      <ShareBar crops_l={slice.crops_l} animals_l={slice.animals_l} />

      <section aria-labelledby="needs-plots-heading">
        <h3 id="needs-plots-heading" className="font-serif text-lg text-ink">
          {t('water.byPlot')}
        </h3>
        {plots.length === 0 ? (
          <EmptyState text={t('water.noPlotsListed')} action={canEdit ? { label: t('plots.add'), onClick: onAddPlot } : { label: t('plots.add'), disabledReason: t('dashboard.noFarmAccess') }} />
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {plots.map((p) => (
              <PlotNeedCard
                key={p.id}
                plot={p}
                litres={horizonLitres(p, horizon)}
                canEdit={canEdit}
                onEdit={() => onEditPlot(p)}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="needs-animals-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="needs-animals-heading" className="font-serif text-lg text-ink">
            {t('water.byAnimal')}
          </h3>
          <button
            type="button"
            onClick={onManageAnimals}
            className="text-sm font-medium text-forest underline-offset-2 hover:underline"
          >
            {t('water.manageAnimals')}
          </button>
        </div>
        {data.animals.length === 0 ? (
          <EmptyState text={t('water.noAnimals')} action={canAddAnimals ? { label: t('water.openAnimals'), onClick: onManageAnimals } : { label: t('water.addAnimals'), disabledReason: t('water.addAnimalsForbidden') }} />
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-white">
            {data.animals.map((a) => (
              <li
                key={a.id}
                className="flex min-w-0 items-baseline justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="break-words text-ink">{a.label} · {formatInt(a.count)}</p>
                  <EnteredBy record={a} />
                </div>
                <div className="min-w-0 text-end">
                  <p className="font-medium text-ink">{litresLabel(horizonLitres(a, horizon))}</p>
                  <AquaEstimate record={a} note={t('estimates.herdWeather')} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="needs-daily-heading">
        <h3 id="needs-daily-heading" className="font-serif text-lg text-ink">
          {t('water.nextWeek')}
        </h3>
        <div className="mt-2 min-w-0">
          <DailyNeedChart days={data.daily} />
        </div>
      </section>

      <details className="rounded-card border border-line bg-cream p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          {t('water.calculation')}
        </summary>
        <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-ink-soft">
          {data.notes.filter((note) => !note.startsWith('Unrecorded refill rates')).map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-soft">
          {data.forecast_used
            ? data.forecast_stale ? t('water.usesLastForecast') : t('water.usesForecast')
            : t('water.usesTypical')}
        </p>
      </details>
    </div>
  )
}

function VerdictCard({
  verdict,
  onAddSources,
}: {
  verdict: WaterBalance['verdict']
  onAddSources: () => void
}) {
  const meta = VERDICT_META[verdict.status]
  const Icon = meta.Icon
  const days = verdict.days_left
  const daysLine =
    days == null
      ? null
      : countLabel('water.daysLeft', days)

  return (
    <article data-card="" className={`rounded-card border p-4 ${meta.card}`}>
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.iconWrap}`}
          aria-hidden
        >
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.chipClass}`}
          >
            {meta.chip}
          </span>
          <p className="mt-2 font-serif text-lg leading-snug text-ink sm:text-xl">
            {verdict.message}
          </p>
          {daysLine ? <p className="mt-1 text-sm text-ink-soft">{daysLine}</p> : null}
          {verdict.status === 'no_sources' ? (
            <button
              type="button"
              onClick={onAddSources}
              className="mt-3 inline-flex items-center rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
            >
              {t('water.addSources')}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function SurplusBanner({ litres, canList }: { litres: number; canList: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-leaf/40 bg-leaf-soft/50 px-4 py-3 text-sm text-ink">
      <p className="min-w-0">{t('water.surplus', { volume: litresAsM3(litres) })}</p>
      {canList ? (
        <button
          type="button"
          onClick={() => {
            setMarketPrefill(litres)
            window.location.hash = VIEW_HREF.market
          }}
          className="inline-flex shrink-0 items-center rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
        >
          {t('water.listSurplus')}
        </button>
      ) : null}
    </div>
  )
}

function HorizonTiles({ slice, supplyUnavailable }: { slice: WaterBalanceHorizon; supplyUnavailable: boolean }) {
  const needM3 = cubicMetresLabel(slice.total_l)
  const haveM3 = cubicMetresLabel(slice.supply_l)
  const balance = signedBalance(slice.balance_l)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <article data-card="" className="min-w-0 rounded-card border border-line bg-cream p-4">
        <p className="text-xs font-medium text-ink-soft">{t('water.needEstimate')}</p>
        <p className="mt-3 font-serif text-3xl leading-none text-ink">
          {formatInt(slice.total_l)}
          <span className="ms-1.5 align-middle font-sans text-sm font-medium text-ink-soft">L</span>
        </p>
        {needM3 ? <p className="mt-1 text-xs text-ink-soft">{needM3}</p> : null}
      </article>
      <article data-card="" className="min-w-0 rounded-card border border-line bg-cream p-4">
        <p className="text-xs font-medium text-ink-soft">{t('water.supplyEstimate')}</p>
        <p className="mt-3 font-serif text-3xl leading-none text-ink">
          {supplyUnavailable ? t('water.insufficientReadings') : formatInt(slice.supply_l)}
          {supplyUnavailable ? null : <span className="ms-1.5 align-middle font-sans text-sm font-medium text-ink-soft">L</span>}
        </p>
        {haveM3 && !supplyUnavailable ? <p className="mt-1 text-xs text-ink-soft">{haveM3}</p> : null}
        <p className="mt-1 text-xs text-ink-soft">{supplyUnavailable ? t('water.missingMeasurements') : t('water.fromReadings')}</p>
      </article>
      <article data-card="" className="min-w-0 rounded-card border border-line bg-cream p-4">
        <p className="text-xs font-medium text-ink-soft">{t('water.balanceEstimate')}</p>
        <p className={`mt-3 font-serif text-3xl leading-none ${supplyUnavailable ? 'text-ink-soft' : BALANCE_TONE[balance.tone]}`}>
          {supplyUnavailable ? t('water.insufficientReadings') : balance.label}
        </p>
      </article>
    </div>
  )
}

function ShareBar({ crops_l, animals_l }: { crops_l: number; animals_l: number }) {
  const total = crops_l + animals_l
  const cropPct = total > 0 ? (crops_l / total) * 100 : 0
  const animalPct = total > 0 ? (animals_l / total) * 100 : 0
  const label =
    total > 0
      ? t('water.cropAnimalNeed', { crops: litresLabel(crops_l), animals: litresLabel(animals_l) })
      : t('water.noNeed')

  return (
    <div>
      <div
        role="img"
        aria-label={label}
        className="flex h-3 overflow-hidden rounded-full bg-cream-deep"
      >
        {cropPct > 0 ? (
          <div className="h-full bg-leaf" style={{ width: `${cropPct}%` }} />
        ) : null}
        {animalPct > 0 ? (
          <div className="h-full bg-ochre" style={{ width: `${animalPct}%` }} />
        ) : null}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-leaf" aria-hidden />
          {t('plots.crops')}{' '} {litresLabel(crops_l)}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ochre" aria-hidden />
          {t('water.animals')}{' '} {litresLabel(animals_l)}
        </li>
      </ul>
    </div>
  )
}

function PlotNeedCard({
  plot,
  litres,
  canEdit,
  onEdit,
}: {
  plot: WaterBalancePlot
  litres: number
  canEdit: boolean
  onEdit: () => void
}) {
  const assumed = plot.defaulted_fields ?? []
  const m3 = cubicMetresLabel(litres)
  const pct = formatInt(Math.round(plot.efficiency * 100))
  return (
    <li data-card="" className="min-w-0 rounded-card border border-line bg-white p-3">
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight text-ink">{plot.name}</p>
          <p className="mt-0.5 truncate text-xs text-ink-soft">{assumed.includes('crop') ? t('water.cropUnset') : plot.crop_label}</p>
          <EnteredBy record={plot} />
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t('common.editNamed', { name: plot.name })}
            title={t('common.editNamed', { name: plot.name })}
            className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-forest"
          >
            <Pencil size={16} aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        {assumed.includes('soil_type') || !plot.soil_type ? t('water.soilUnset') : plot.soil_label}
        {' · '}{assumed.includes('irrigation') || !plot.irrigation ? t('water.irrigationUnset') : irrigationLabel(plot.irrigation)}
        {' · '}{assumed.includes('area_m2') ? t('water.areaUnset') : `${formatInt(plot.area_m2)} m² (${formatHa(plot.area_m2)} ha)`}
      </p>
      <AquaEstimate record={plot} note={t('estimates.irrigation')} />
      <p className="text-xs text-ink-soft">{t('water.efficiency')}{' '} {pct}%</p>
      <p className="mt-2 font-serif text-2xl leading-none text-ink">
        {formatInt(litres)}
        <span className="ms-1.5 align-middle font-sans text-sm font-medium text-ink-soft">L</span>
      </p>
      {m3 ? <p className="mt-1 text-xs text-ink-soft">{m3}</p> : null}
      <p className="mt-2 text-xs text-ink-soft">
        {t('water.intervalAndDose', { days: formatInt(plot.interval_days), volume: formatInt(plot.per_irrigation_l) })}
      </p>
    </li>
  )
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
      >
        {t('common.retry')}
      </button>
    </div>
  )
}

function NeedsSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="rounded-card border border-line bg-white p-4">
        <div className="aqua-skel h-5 w-24 rounded-full" />
        <div className="aqua-skel mt-3 h-6 w-3/4 rounded" />
      </div>
      <div className="aqua-skel h-10 w-64 rounded-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-white p-4">
            <div className="aqua-skel h-3 w-16 rounded" />
            <div className="aqua-skel mt-3 h-8 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="aqua-skel h-3 w-full rounded-full" />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border border-line bg-white p-3">
            <div className="aqua-skel h-4 w-2/3 rounded" />
            <div className="aqua-skel mt-2 h-3 w-1/2 rounded" />
            <div className="aqua-skel mt-3 h-7 w-24 rounded" />
          </div>
        ))}
      </div>
      <div className="aqua-skel h-56 w-full rounded-card" />
    </div>
  )
}
