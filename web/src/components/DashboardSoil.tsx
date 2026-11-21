import { t } from '../i18n'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import {
  ApiError,
  api,
  canManageWater,
  isAbortError,
  type FarmSoil,
  type SoilCard,
} from '../api'
import { formatInt } from '../lib/status'
import { useDashboardPoll } from '../lib/useDashboardPoll'
import { AquaEstimate, EnteredBy } from './EnteredBy'
import { LiveNumber } from './StatTile'

const TEXTURE: Record<string, { label: string; value: number }> = {
  sand: { get label() { return t('soil.sand') }, value: 1 },
  sandy_loam: { get label() { return t('soil.sandyLoam') }, value: 2 },
  loam: { get label() { return t('soil.loam') }, value: 3 },
  clay_loam: { get label() { return t('soil.clayLoam') }, value: 4 },
  clay: { get label() { return t('soil.clay') }, value: 5 },
}
const LOW_HIGH: Record<string, { label: string; value: number }> = {
  low: { get label() { return t('soil.low') }, value: 1 },
  medium: { get label() { return t('soil.medium') }, value: 2 },
  high: { get label() { return t('soil.high') }, value: 3 },
}
const DRAINAGE: Record<string, { label: string; value: number }> = {
  poor: { get label() { return t('soil.poor') }, value: 1 },
  medium: { get label() { return t('soil.medium') }, value: 2 },
  good: { get label() { return t('soil.good') }, value: 3 },
  excellent: { get label() { return t('soil.excellent') }, value: 4 },
}
const SWATCH: Record<string, [string, string, string]> = {
  sand: ['#e8c58a', '#d4a054', '#c4a574'],
  sandy_loam: ['#e8c58a', '#c4a574', '#8b5a2b'],
  loam: ['#c4a574', '#8b5a2b', '#5c4030'],
  clay_loam: ['#a65d4e', '#8b3a2f', '#5c4030'],
  clay: ['#4a3728', '#2c241c', '#1b4d3e'],
}

function words(value: string) {
  const clean = value.trim()
  return clean ? clean.replaceAll('_', ' ') : t('common.notSet')
}

function percent(confidence: number | undefined) {
  if (confidence == null || !Number.isFinite(confidence)) return null
  return formatInt(confidence <= 1 ? confidence * 100 : confidence)
}

function sourceBadge(soil: FarmSoil) {
  if (soil.source === 'farmer') return t('dashboard.enteredByYou')
  const sure = percent(soil.confidence)
  const place = soil.governorate?.trim()
  if (place && sure) return t('soil.predictedLocationConfidence', { location: place, confidence: sure })
  if (place) return t('soil.predictedLocation', { location: place })
  if (sure) return t('soil.predictedConfidence', { confidence: sure })
  return t('soil.predicted')
}

function SoilSwatch({ texture }: { texture: string }) {
  const layers = SWATCH[texture] ?? ['#c4a574', '#8b5a2b', '#5c4030']
  const grain = texture === 'sand' || texture === 'sandy_loam'
  const label = TEXTURE[texture]?.label ?? words(texture)
  return (
    <span
      role="img"
      aria-label={t('soil.named', { soil: label })}
      className="relative inline-block size-12 shrink-0 overflow-hidden rounded-full border border-line"
    >
      {layers.map((color, index) => (
        <span
          key={color}
          className="absolute inset-x-0"
          style={{ background: color, top: `${index * 34}%`, height: '36%' }}
        />
      ))}
      {grain ? (
        <span
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgb(36 31 26 / 0.28) 0.6px, transparent 0.7px)',
            backgroundSize: '4px 4px',
          }}
        />
      ) : null}
    </span>
  )
}

function PropertyBar({
  label, text, value, max,
}: {
  label: string
  text: string
  value: number | null
  max: number
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
        <span className="text-ink-soft [font-variant:all-small-caps]">{label}</span>
        <span className="font-medium text-ink">{text}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={text}
        className="mt-1 h-1.5 rounded-full bg-cream-deep"
      >
        {value != null ? (
          <div className="h-full rounded-full bg-forest" style={{ width: `${(value / max) * 100}%` }} />
        ) : null}
      </div>
    </div>
  )
}

function PhBar({ ph }: { ph: string }) {
  const match = ph.match(/(\d+(?:\.\d+)?)\s+to\s+(\d+(?:\.\d+)?)/)
  const lo = match ? Number(match[1]) : null
  const hi = match ? Number(match[2]) : null
  const text = ph.trim() || t('common.notSet')
  const scaleMin = 4
  const scaleMax = 10
  const span = scaleMax - scaleMin
  const known = lo != null && hi != null && Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo
  const left = known ? Math.min(100, Math.max(0, ((lo - scaleMin) / span) * 100)) : 0
  const width = known ? Math.min(100 - left, Math.max(0, ((hi - lo) / span) * 100)) : 0
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
        <span className="text-ink-soft [font-variant:all-small-caps]">pH</span>
        <span className="font-medium text-ink">{text}</span>
      </div>
      <div
        role="meter"
        aria-label="pH"
        aria-valuemin={scaleMin}
        aria-valuemax={scaleMax}
        aria-valuenow={known ? lo : undefined}
        aria-valuetext={text}
        className="relative mt-1 h-1.5 rounded-full bg-cream-deep"
      >
        {known ? (
          <div className="absolute top-0 h-full rounded-full bg-forest" style={{ left: `${left}%`, width: `${Math.max(width, 4)}%` }} />
        ) : null}
      </div>
    </div>
  )
}

function levelBar(label: string, raw: string, scale: Record<string, { label: string; value: number }>, max: number) {
  const rank = scale[raw]
  return <PropertyBar label={label} text={rank?.label ?? words(raw)} value={rank?.value ?? null} max={max} />
}

function useDialogTrap(open: boolean, busy: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = () => { if (!busy) onClose() }

  useEffect(() => {
    if (!open) return
    const root = panelRef.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pick = () =>
      root
        ? [...root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )]
        : []
    pick()[0]?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !root) return
      const els = pick()
      if (els.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }
      const index = els.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault()
          els[els.length - 1].focus()
        }
      } else if (index === -1 || index === els.length - 1) {
        event.preventDefault()
        els[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open])

  return { panelRef, requestClose: () => onCloseRef.current() }
}

function ChooseSoilDialog({
  open, farmId, currentKey, currentDescription, onClose, onSaved,
}: {
  open: boolean
  farmId: number
  currentKey: string
  currentDescription: string
  onClose: () => void
  onSaved: (soil: FarmSoil) => void
}) {
  const titleId = useId()
  const descId = useId()
  const [soils, setSoils] = useState<SoilCard[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(currentKey)
  const [description, setDescription] = useState(currentDescription)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { panelRef, requestClose } = useDialogTrap(open, busy, onClose)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    setSelected(currentKey)
    setDescription(currentDescription.slice(0, 600))
    setError('')
    setBusy(false)
    void api.soilCatalog(controller.signal).then(
      (page) => { setSoils(page.soils); setLoadError('') },
      (reason: unknown) => {
        if (isAbortError(reason)) return
        setLoadError(reason instanceof ApiError ? reason.message : t('soil.loadTypesError'))
      },
    )
    return () => controller.abort()
  }, [open, currentKey, currentDescription])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (busy || !selected) return
    setBusy(true)
    setError('')
    try {
      onSaved(await api.setFarmSoil(farmId, { soil_key: selected, description: description.trim() }))
      onClose()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('soil.saveError'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-forest-deep/45" aria-label={t('common.closeDialog')} tabIndex={-1} onClick={requestClose} />
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <h2 id={titleId} className="font-serif text-2xl text-ink">{t('soil.choose')}</h2>
          <button type="button" disabled={busy} onClick={requestClose} className="rounded-full p-1.5 text-ink-soft hover:bg-cream" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void save(event)}>
          <div className="page-scroll min-h-0 flex-1 px-5 py-3">
            {loadError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hanko/30 bg-hanko/5 p-3 text-xs text-hanko">
                {loadError}
                <button type="button" className="font-medium underline" onClick={() => {
                  setLoadError('')
                  setSoils(null)
                  void api.soilCatalog().then(
                    (page) => setSoils(page.soils),
                    (reason: unknown) => setLoadError(reason instanceof ApiError ? reason.message : t('soil.loadTypesError')),
                  )
                }}>{t('common.retry')}</button>
              </div>
            ) : null}
            {!soils && !loadError ? <div className="aqua-skel h-40 rounded-card" role="status" aria-label={t('soil.loadingTypes')} /> : null}
            {soils ? (
              <fieldset className="grid gap-2">
                <legend className="sr-only">{t('soil.types')}</legend>
                {soils.map((soil) => {
                  const texture = TEXTURE[soil.texture]?.label ?? words(soil.texture)
                  return (
                    <label key={soil.key} className={`block min-w-0 cursor-pointer rounded-card border p-3 ${selected === soil.key ? 'border-forest bg-cream' : 'border-line bg-white'}`}>
                      <span className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="farm-soil"
                          value={soil.key}
                          checked={selected === soil.key}
                          onChange={() => setSelected(soil.key)}
                          className="mt-1"
                        />
                        <span className="min-w-0">
                          <span className="block break-words font-serif text-base leading-tight text-ink">{soil.name}</span>
                          <span className="mt-0.5 block break-words text-xs text-ink-soft">{soil.summary}</span>
                          <span className="mt-1 block text-[11px] text-ink-soft">{t('soil.texture')}{' '} {texture}</span>
                          {soil.crops.length ? (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {soil.crops.map((crop) => (
                                <span key={crop} className="rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] text-ink">{crop}</span>
                              ))}
                            </span>
                          ) : <span className="mt-1 block text-[11px] text-ink-soft">{t('soil.cropsMissing')}</span>}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            ) : null}
            <div className="mt-3">
              <label htmlFor={descId} className="text-xs font-medium text-ink-soft">{t('common.description')}{' '} <span className="font-normal">{t('common.optional')}</span></label>
              <textarea
                id={descId}
                value={description}
                maxLength={600}
                rows={3}
                disabled={busy}
                onChange={(event) => setDescription(event.target.value.slice(0, 600))}
                className="mt-1 w-full resize-y rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
              <p className="text-[11px] text-ink-soft">{formatInt(description.length)} / 600</p>
            </div>
            {error ? <p role="alert" className="mt-2 text-xs text-hanko">{error}</p> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
            <button type="button" disabled={busy} onClick={requestClose} className="rounded-full border border-line px-4 py-1.5 text-xs font-medium disabled:opacity-60">{t('common.cancel')}</button>
            <button type="submit" disabled={busy || !selected || !soils} className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              {busy ? t('common.saving') : t('soil.save')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}

export function DashboardSoil({ farmId, role }: { farmId: number; role: string }) {
  const [data, setData] = useState<FarmSoil | null>(null)
  const [error, setError] = useState('')
  const [revision, revise] = useState(0)
  const [chooser, setChooser] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [actionError, setActionError] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const canManage = canManageWater(role)
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const next = await api.farmSoil(farmId, signal)
      if (!signal.aborted) {
        setData(next)
        setError('')
      }
    } catch (reason) {
      if (signal.aborted || isAbortError(reason)) return
      setError(reason instanceof ApiError ? reason.message : t('soil.loadError'))
    }
  }, [farmId])
  useDashboardPoll(load, 30_000, revision)

  async function applyPrediction() {
    if (!canManage || clearing) return
    setClearing(true)
    setActionError('')
    try {
      await api.clearFarmSoil(farmId)
      setConfirmClear(false)
      setData(null)
      revise((value) => value + 1)
      heading.current?.focus()
    } catch (reason) {
      setActionError(reason instanceof ApiError ? reason.message : t('soil.autoError'))
    } finally {
      setClearing(false)
    }
  }

  const guessSure = percent(data?.predicted?.confidence)

  return (
    <section aria-labelledby="dashboard-soil" className="flex flex-col gap-3 p-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-soil" ref={heading} tabIndex={-1} className="font-serif text-lg text-ink">{t('dashboard.soil')}</h2>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { setActionError(''); setConfirmClear(false); setChooser(true) }} className="rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white">
              {t('soil.choose')}
            </button>
            {data?.source === 'farmer' ? (
              <button type="button" disabled={clearing} onClick={() => { setActionError(''); setConfirmClear(true) }} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium disabled:opacity-60">
                {t('soil.useAuto')}
              </button>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-ink-soft" title={t('soil.editPermission')}>{t('common.readOnly')}</span>
        )}
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hanko/30 bg-hanko/5 p-3 text-xs text-hanko">
          {error}
          <button type="button" className="font-medium underline" onClick={() => revise((value) => value + 1)}>{t('common.retry')}</button>
        </div>
      ) : null}
      {actionError ? <p role="alert" className="text-xs text-hanko">{actionError}</p> : null}
      {!data && !error ? <div className="aqua-skel h-40 rounded-card" role="status" aria-label={t('soil.loading')} /> : null}
      {data ? (
        <div className="grid gap-3">
          <article data-card="" className="min-w-0 rounded-card border border-line bg-paper p-3">
            <div className="flex min-w-0 items-start gap-3">
              <SoilSwatch texture={data.soil.texture} />
              <div className="min-w-0">
                <h3 className="break-words font-serif text-lg leading-tight text-ink">{data.soil.name}</h3>
                <p className="mt-1 break-words text-xs text-ink-soft">{data.soil.summary}</p>
                <p className="mt-2">
                  <span className="inline-block rounded-full bg-cream-deep px-2 py-0.5 text-[11px] text-ink">{sourceBadge(data)}</span>
                </p>
                {data.source === 'predicted' ? <AquaEstimate record={data} /> : <EnteredBy record={data} verb="Recorded" />}
              </div>
            </div>
            {data.description.trim() ? (
              <p className="mt-3 break-words text-sm text-ink">{data.description}</p>
            ) : null}
            <div className="mt-3 grid gap-2">
              {levelBar(t('soil.texturePlain'), data.soil.texture, TEXTURE, 5)}
              <PhBar ph={data.soil.ph} />
              {levelBar(t('soil.organicMatter'), data.soil.organic_matter, LOW_HIGH, 3)}
              {levelBar(t('soil.waterHolding'), data.soil.water_holding, LOW_HIGH, 3)}
              {levelBar(t('soil.drainage'), data.soil.drainage, DRAINAGE, 4)}
              {levelBar(t('soil.salinityRisk'), data.soil.salinity_risk, LOW_HIGH, 3)}
            </div>
            <div className="mt-3">
              <h4 className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{t('soil.suitedCrops')}</h4>
              {data.soil.crops.length ? (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {data.soil.crops.map((crop) => (
                    <li key={crop} className="rounded-full border border-line bg-cream px-2 py-0.5 text-[11px] text-ink">{crop}</li>
                  ))}
                </ul>
              ) : <p className="mt-1 text-xs text-ink-soft">{t('common.notSet')}</p>}
            </div>
            {data.soil.tips.length ? (
              <div className="mt-3">
                <h4 className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{t('soil.tips')}</h4>
                <ul className="mt-1 grid gap-1 text-sm text-ink">
                  {data.soil.tips.map((tip) => <li key={tip} className="break-words">{tip}</li>)}
                </ul>
              </div>
            ) : null}
            {data.reasons?.length ? (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-forest">{t('soil.why')}</summary>
                <ul className="mt-1 grid gap-1 text-xs text-ink-soft">
                  {data.reasons.map((reason) => <li key={reason} className="break-words">{reason}</li>)}
                </ul>
              </details>
            ) : null}
            {data.notes.length ? (
              <ul className="mt-3 grid gap-1">
                {data.notes.map((note) => (
                  <li key={note} className="break-words rounded-card bg-ochre/15 px-2 py-1 text-xs text-ink">{note}</li>
                ))}
              </ul>
            ) : null}
            {data.source === 'farmer' && data.predicted ? (
              <p className="mt-3 flex flex-wrap items-center gap-1 text-xs text-ink-soft">
                {t('soil.aquaGuess')}{' '} {data.predicted.soil.name}{guessSure ? ` (${guessSure}% sure)` : ''}
                <AquaEstimate record={data.predicted} />
              </p>
            ) : null}
          </article>
          <div aria-live="polite" data-card="" className="rounded-card border border-line bg-cream px-3 py-2">
            <h3 className="font-serif text-base text-ink">{t('soil.live')}</h3>
            <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
              <div>
                <dt className="inline [font-variant:all-small-caps]">{t('soil.average')}{' '} </dt>
                <dd className="inline font-medium text-ink"><LiveNumber value={data.live.average_moisture} unit="%" /></dd>
                <span className="block">
                  {data.live.plots === 0
                    ? t('farm.noPlots')
                    : t('soil.plotFraction', { recorded: formatInt(data.live.plots_with_readings), total: formatInt(data.live.plots) })}
                </span>
              </div>
              <div>
                <dt className="inline [font-variant:all-small-caps]">{t('weather.weekRain')}{' '} </dt>
                <dd className="inline font-medium text-ink"><LiveNumber value={data.live.rain_next_7_days_mm} unit=" mm" /></dd>
                {data.live.forecast_stale ? <span className="block">{t('weather.lastForecast')}</span> : null}
              </div>
              <div>
                <dt className="inline [font-variant:all-small-caps]">{t('soil.irrigations')}{' '} </dt>
                <dd className="inline font-medium text-ink">{formatInt(data.live.irrigations_last_14_days)}</dd>
                {data.live.irrigations_basis === 'aqua_recommendations' ? (
                  <AquaEstimate note={t('estimates.adviceCount')} />
                ) : null}
              </div>
            </dl>
          </div>
          {canManage && confirmClear ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink">{t('soil.confirmAuto')}</span>
              <button type="button" disabled={clearing} onClick={() => void applyPrediction()} className="rounded-full bg-forest-deep px-3 py-1 text-white disabled:opacity-60">
                {clearing ? t('common.switching') : t('soil.usePrediction')}
              </button>
              <button type="button" disabled={clearing} onClick={() => setConfirmClear(false)} className="rounded-full border border-line px-3 py-1 disabled:opacity-60">{t('common.cancel')}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      {canManage ? (
        <ChooseSoilDialog
          open={chooser}
          farmId={farmId}
          currentKey={data?.source === 'farmer' ? data.soil.key : ''}
          currentDescription={data?.source === 'farmer' ? data.description : ''}
          onClose={() => setChooser(false)}
          onSaved={(next) => {
            setData(next)
            setError('')
            heading.current?.focus()
          }}
        />
      ) : null}
    </section>
  )
}
