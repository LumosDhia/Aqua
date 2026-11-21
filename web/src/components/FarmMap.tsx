import { t } from '../i18n'
import { FarmPlanScene } from './plan/FarmPlanScene'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Maximize2,
  Minimize2,
  Plus,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  X,
} from 'lucide-react'
import {
  ApiError,
  api,
  canAddPlot,
  canControlDevices,
  canDecide,
  type DecisionResult,
  type Device,
  type FarmAnimals,
  type OverviewPlot,
  type WaterSource,
} from '../api'
import { WaterNowRow } from './devices/WaterNowRow'
import { plotPump } from './devices/format'
import { AquaEstimate, EnteredBy } from './EnteredBy'
import './art/farm/farmMap.css'
import {
  cropColor,
  formatHa,
  formatInt,
  formatRelative,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
} from '../lib/status'

export type FilterMode = 'all' | 'healthy' | 'attention'
export type ColorMode = 'status' | 'moisture' | 'crop'


type FarmMapProps = {
  plots: OverviewPlot[]
  role: string
  selectedId: number | null
  onSelect: (id: number | null) => void
  search: string
  filterMode: FilterMode
  onAddPlot?: () => void
  onRefresh: () => void
  farmId: number | null
  devices: Device[]
  onDevicesRefresh: () => void
  waterSources: WaterSource[]
}

function dimmed(plot: OverviewPlot, search: string, filterMode: FilterMode): boolean {
  const q = search.trim().toLowerCase()
  if (q) {
    const hit =
      plot.name.toLowerCase().includes(q) ||
      plot.crop.toLowerCase().includes(q) ||
      plot.crop_label.toLowerCase().includes(q)
    if (!hit) return true
  }
  if (filterMode === 'attention' && plot.status === 'ok') return true
  if (filterMode === 'healthy' && plot.status !== 'ok') return true
  return false
}


function irrigationLabel(v: string): string {
  if (!v) return '—'
  return v.charAt(0).toUpperCase() + v.slice(1)
}



export function FarmMap({
  plots,
  role,
  selectedId,
  onSelect,
  search,
  filterMode,
  onAddPlot,
  onRefresh,
  farmId,
  devices,
  onDevicesRefresh,
  waterSources,
}: FarmMapProps) {
  const wrapRef = useRef<HTMLElement>(null)
  const detailRef = useRef<HTMLElement>(null)
  const modeRef = useRef<HTMLSelectElement>(null)
  const [mode, setMode] = useState<ColorMode>('status')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  // the tilted farm is wider than tall: in a tall panel open it a little closer, then let people drag it around
  const fitZoom = useCallback(() => {
    const el = wrapRef.current
    if (!el) return 1
    const r = el.getBoundingClientRect()
    return r.height > r.width * 1.05 ? 1.3 : 1
  }, [])
  useEffect(() => {
    setZoom(fitZoom())
  }, [fitZoom])
  const [fs, setFs] = useState(false)
  const [fakeFs, setFakeFs] = useState(false)
  const [decision, setDecision] = useState<DecisionResult | null>(null)
  const [decideErr, setDecideErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [animals, setAnimals] = useState<FarmAnimals | null>(null)
  const [workerCount, setWorkerCount] = useState(0)
  const [overlayError, setOverlayError] = useState(false)
  const [overlayRevision, retryOverlay] = useState(0)

  useEffect(() => {
    function onFs() {
      setFs(!!document.fullscreenElement)
      if (!document.fullscreenElement) setFakeFs(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    setDecision(null)
    setDecideErr('')
  }, [selectedId])

  useEffect(() => {
    if (farmId == null) return
    let cancelled = false
    void Promise.allSettled([api.farmAnimals(farmId), api.workers(farmId)]).then(([herds, people]) => {
      if (cancelled) return
      if (herds.status === 'fulfilled') setAnimals(herds.value)
      if (people.status === 'fulfilled') setWorkerCount(people.value.length)
      setOverlayError(herds.status === 'rejected' || people.status === 'rejected')
    })
    return () => {
      cancelled = true
    }
  }, [farmId, overlayRevision])


  const byId = useMemo(() => {
    const m = new Map<number, OverviewPlot>()
    for (const p of plots) m.set(p.id, p)
    return m
  }, [plots])


  const selected = selectedId != null ? (byId.get(selectedId) ?? null) : null
  const openId = selected?.id
  useEffect(() => {
    if (openId != null) detailRef.current?.focus()
  }, [openId])
  const canControl = canControlDevices(role)
  const linkedPump = selected && farmId != null ? plotPump(devices, selected.id) : null


  const toggleFs = useCallback(async () => {
    const el = wrapRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setFakeFs(false)
        return
      }
      if (fakeFs) {
        setFakeFs(false)
        return
      }
      if (el.requestFullscreen) {
        await el.requestFullscreen()
        return
      }
      setFakeFs(true)
    } catch {
      setFakeFs(true)
    }
  }, [fakeFs])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || selectedId == null) return
      const t = e.target
      if (t instanceof Element && t.closest('[role="dialog"]')) return
      e.preventDefault()
      onSelect(null)
      modeRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onSelect])

  async function runDecision() {
    if (!selected) return
    setBusy(true)
    setDecideErr('')
    try {
      const res = await api.decide(selected.id)
      setDecision(res)
      onRefresh()
    } catch (error) {
      setDecideErr(
        error instanceof ApiError
          ? error.status === 403
            ? t('dashboard.readPermission')
            : error.message
          : t('dashboard.runDecisionError'),
      )
    } finally {
      setBusy(false)
    }
  }

  const crops = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of plots) m.set(p.crop, p.crop_label)
    return [...m.entries()].map(([id, label]) => ({ id, label }))
  }, [plots])

  const isFs = fs || fakeFs

  return (
    <section
      ref={wrapRef}
      data-card=""
      className={`relative isolate overflow-hidden rounded-card border border-line bg-cream ${
        fakeFs ? 'fixed inset-3 z-50' : 'h-full min-h-[28rem] lg:min-h-0'
      }`}
      aria-label={t('dashboard.map')}
    >
      {plots.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="max-w-xs text-sm text-ink">{t('dashboard.mapEmpty')}</p>
          {canAddPlot(role) && onAddPlot ? (
            <button
              type="button"
              onClick={onAddPlot}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
            >
              <Plus size={16} aria-hidden />
              {t('plots.add')}
            </button>
          ) : null}
        </div>
      ) : (
        <div
          className={`absolute inset-0 origin-center will-change-transform ${panning ? 'cursor-grabbing' : 'cursor-grab transition-transform duration-300'}`}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, touchAction: 'none' }}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d) return
            const dx = e.clientX - d.x
            const dy = e.clientY - d.y
            if (!d.moved && Math.hypot(dx, dy) < 5) return
            if (!d.moved) {
              d.moved = true
              setPanning(true)
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }
            setPan({ x: d.px + dx, y: d.py + dy })
          }}
          onPointerUp={() => {
            setPanning(false)
            setTimeout(() => {
              drag.current = null
            }, 0)
          }}
          onClickCapture={(e) => {
            if (drag.current?.moved) {
              e.stopPropagation()
              e.preventDefault()
            }
          }}
        >
          <FarmPlanScene
            plots={plots}
            sources={waterSources}
            animals={animals}
            workers={workerCount}
            mode={mode}
            selectedId={selectedId}
            isDimmed={(p) => dimmed(p, search, filterMode)}
            onSelect={onSelect}
          />
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 z-20">
        <div className="pointer-events-auto absolute top-3 start-3">
          <label className="inline-flex items-center gap-1 rounded-full border border-line bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-shell backdrop-blur-md">
            <span>{t('dashboard.schematic')}</span>
            <select
              ref={modeRef}
              className="bg-transparent text-xs text-ink outline-none"
              value={mode}
              onChange={(e) => setMode(e.target.value as ColorMode)}
              aria-label={t('dashboard.mapColour')}
            >
              <option value="status">{t('common.status')}</option>
              <option value="moisture">{t('dashboard.moistureShort')}</option>
              <option value="crop">{t('plots.crop')}</option>
            </select>
          </label>
        </div>

        {overlayError ? (
          <p role="alert" className="pointer-events-auto absolute inset-x-3 top-14 w-fit max-w-[calc(100%-1.5rem)] rounded-card border border-line bg-paper px-3 py-1.5 text-xs text-ink">
            {t('dashboard.mapPartialError')}{' '}
            <button type="button" onClick={() => retryOverlay((value) => value + 1)} className="font-medium text-forest underline">{t('common.retry')}</button>
          </p>
        ) : null}

        <div className="pointer-events-auto absolute top-3 end-3">
          <button
            type="button"
            onClick={() => void toggleFs()}
            className="rounded-full border border-line bg-white/90 p-2 text-ink shadow-shell backdrop-blur-md"
            aria-label={isFs ? t('dashboard.fullscreenExit') : t('dashboard.fullscreenEnter')}
          >
            {isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {plots.length > 0 ? (
          <div className="pointer-events-auto absolute bottom-3 start-3 max-h-[30%] max-w-[calc(100%-9.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white/90 p-2.5 text-[11px] text-ink shadow-shell backdrop-blur-md">
            <p className="mb-1 font-medium">
              {mode === 'status' ? t('common.status') : mode === 'moisture' ? t('dashboard.moistureShort') : t('plots.crop')}
            </p>
            {mode === 'status' ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {STATUS_ORDER.map((s) => (
                  <li key={s} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: STATUS_COLOR[s] }}
                      aria-hidden
                    />
                    {STATUS_LABEL[s]}
                  </li>
                ))}
              </ul>
            ) : null}
            {mode === 'moisture' ? (
              <div>
                <div className="bg-ochre-teal h-2 rounded-full" />
                <div className="mt-1 flex justify-between text-ink-soft">
                  <span>{t('dashboard.dry')}</span>
                  <span>{t('dashboard.wet')}</span>
                </div>
              </div>
            ) : null}
            {mode === 'crop' ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-1">
                {crops.map((c) => (
                  <li key={c.id} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: cropColor(c.id) }}
                      aria-hidden
                    />
                    {c.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="pointer-events-auto absolute end-3 bottom-3 flex flex-row gap-1.5">
          <button
            type="button"
            aria-label={t('dashboard.zoomIn')}
            onClick={() => setZoom((z) => Math.min(2.2, Math.round((z + 0.2) * 10) / 10))}
            className="rounded-full border border-line bg-white/90 p-2 text-ink shadow-shell backdrop-blur-md"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            aria-label={t('dashboard.zoomOut')}
            onClick={() => setZoom((z) => Math.max(0.8, Math.round((z - 0.2) * 10) / 10))}
            className="rounded-full border border-line bg-white/90 p-2 text-ink shadow-shell backdrop-blur-md"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            aria-label={t('dashboard.zoomReset')}
            onClick={() => {
              setZoom(fitZoom())
              setPan({ x: 0, y: 0 })
            }}
            className="rounded-full border border-line bg-white/90 p-2 text-ink shadow-shell backdrop-blur-md"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      {selected ? (
        <aside ref={detailRef} tabIndex={-1} aria-label={t('dashboard.plotDetails', { name: selected.name })} className="absolute bottom-16 left-1/2 z-30 max-h-[calc(100%-5.5rem)] w-[min(22rem,calc(100%-1.5rem))] -translate-x-1/2 overflow-x-hidden overflow-y-auto overscroll-contain rounded-card border border-line bg-white/95 p-4 text-sm text-ink shadow-shell backdrop-blur-md">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="break-words font-serif text-lg leading-tight">{selected.name}</h3>
              <p className="text-xs text-ink-soft">
                {selected.defaulted_fields?.includes('crop') ? t('plots.cropMissing') : selected.crop_label} · {irrigationLabel(selected.irrigation)}
              </p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
              style={{ background: STATUS_COLOR[selected.status] }}
            >
              {STATUS_LABEL[selected.status]}
            </span>
            <button type="button" aria-label={t('farm.closeDetails')} className="shrink-0 rounded-full p-1 text-ink-soft hover:bg-cream" onClick={() => { onSelect(null); modeRef.current?.focus() }}>
              <X size={15} aria-hidden />
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {selected.defaulted_fields?.includes('area_m2')
              ? t('plots.areaMissing')
              : t('dashboard.areaValue', { area: selected.area_m2 > 10_000 ? `${formatHa(selected.area_m2, 4)} ha` : `${formatInt(selected.area_m2)} m²` })}
          </p>
          <Meter label={t('dashboard.moisture')} value={selected.soil_moisture} target={selected.defaulted_fields?.includes('crop') ? null : selected.target} />
          <Meter label={t('dashboard.tankLevel')} value={selected.tank_level} />
          <p className="mt-2 text-xs text-ink-soft">
            {t('dashboard.temperature')}{' '}
            {selected.temperature == null ? t('common.noReading') : `${formatInt(selected.temperature)}°C`}
          </p>
          <p className="text-xs text-ink-soft">
            {selected.last_ts ? <>{t('dashboard.lastReading')}{' '} <time dateTime={selected.last_ts}>{formatRelative(selected.last_ts)}</time></> : t('common.noReading')}
          </p>
          {selected.reading_source === 'manual' ? <EnteredBy record={{ entered_by: selected.reading_entered_by }} verb="Recorded" /> : null}
          {selected.warnings.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 ps-4 text-xs text-ink">
              {selected.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {canControl && linkedPump && farmId != null ? (
            <div className="mt-3 min-w-0">
              <p className="mb-1.5 text-xs font-medium text-ink">{t('dashboard.waterPlot')}</p>
              <WaterNowRow
                farmId={farmId}
                device={linkedPump.device}
                actuator={linkedPump.actuator}
                canControl={canControl}
                pick="select"
                onSettled={onDevicesRefresh}
              />
            </div>
          ) : null}
          {canDecide(role) ? (
            <button
              type="button"
              onClick={() => void runDecision()}
              disabled={busy}
              className="mt-3 rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {busy ? t('devices.runningNow') : t('dashboard.runDecision')}
            </button>
          ) : (
            <p className="mt-3 text-xs text-ink-soft">{t('dashboard.readPermission')}</p>
          )}
          {decideErr ? (
            <p className="mt-2 text-xs text-hanko" role="alert">
              {decideErr}
            </p>
          ) : null}
          {decision ? (
            <div className="mt-2 min-w-0">
              <p className="text-xs text-forest">
                <span className="font-medium capitalize">{decision.action}</span>
                {' — '}
                {decision.why}
                {decision.recorded ? <> {' '}{t('dashboard.estimatedSavings')}{' '} {formatInt(decision.litres_saved)} L. <AquaEstimate record={decision} /></> : null}
              </p>
              {farmId != null &&
              canControl &&
              linkedPump &&
              linkedPump.device.online &&
              (decision.action === 'irrigate' || decision.action === 'light') ? (
                <div className="mt-1.5">
                  <WaterNowRow
                    farmId={farmId}
                    device={linkedPump.device}
                    actuator={linkedPump.actuator}
                    canControl={canControl}
                    pick="shortest"
                    onSettled={onDevicesRefresh}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>
      ) : null}
    </section>
  )
}



function Meter({
  label,
  value,
  target,
}: {
  label: string
  value: number | null
  target?: number | null
}) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, value))
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[11px] text-ink-soft">
        <span>{label}</span>
        <span>
          {value == null ? t('common.noReading') : `${formatInt(value)}%`}
          {target != null ? ` · target ${Math.round(target)}%` : ''}
        </span>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-cream-deep">
        <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
        {target != null ? (
          <span
            className="absolute top-0 h-full w-0.5 bg-ink"
            style={{ left: `${Math.min(100, Math.max(0, target))}%` }}
            title={t('dashboard.targetMoisture', { percent: Math.round(target) })}
          />
        ) : null}
      </div>
    </div>
  )
}
