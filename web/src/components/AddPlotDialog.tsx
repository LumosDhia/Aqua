import { t } from '../i18n'
import { EnteredBy } from './EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, isSoilType, type Attribution, type Crop, type FarmPlot, type SoilType } from '../api'
import { IRRIGATION_TYPES, SOIL_TYPES, parseSoilType } from '../lib/plotFields'

export type PlotFormValue = Attribution & {
  defaulted_fields?: string[] | null
  id: number
  name: string
  crop: string
  area_m2: number
  irrigation: string
  soil_type: string
}

type AddPlotDialogProps = {
  open: boolean
  requireDetails?: boolean
  farmId: number
  plot?: PlotFormValue | null
  onClose: () => void
  onCreated?: (plot: FarmPlot) => void
  onUpdated?: (plot: FarmPlot) => void
}

export function AddPlotDialog({
  open,
  requireDetails = false,
  farmId,
  plot = null,
  onClose,
  onCreated,
  onUpdated,
}: AddPlotDialogProps) {
  const titleId = useId()
  const nameId = useId()
  const cropId = useId()
  const areaId = useId()
  const irrId = useId()
  const soilId = useId()
  const soilHelpId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const editing = plot != null
  const [crops, setCrops] = useState<Crop[]>([])
  const [name, setName] = useState('')
  const [crop, setCrop] = useState('')
  const [area, setArea] = useState(requireDetails ? '' : '1000')
  const [irrigation, setIrrigation] = useState<string>(requireDetails ? '' : 'drip')
  const [soil, setSoil] = useState<SoilType | ''>(requireDetails ? '' : 'loam')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [loadErr, setLoadErr] = useState('')
  const plotRef = useRef(plot)
  plotRef.current = plot
  const plotId = plot?.id ?? null

  useEffect(() => {
    if (!open) return
    setErr('')
    setLoadErr('')
    setBusy(false)
    const current = plotRef.current
    if (current) {
      const assumed = requireDetails ? current.defaulted_fields ?? [] : []
      const hasSoil = isSoilType(current.soil_type) && !assumed.includes('soil_type')
      setName(current.name)
      setArea(assumed.includes('area_m2') ? '' : String(current.area_m2))
      setIrrigation(assumed.includes('irrigation') ? '' : current.irrigation || (requireDetails ? '' : 'drip'))
      setSoil(requireDetails && !hasSoil ? '' : parseSoilType(current.soil_type))
      setCrop(assumed.includes('crop') ? '' : current.crop)
    } else {
      setName('')
      setArea(requireDetails ? '' : '1000')
      setIrrigation(requireDetails ? '' : 'drip')
      setSoil(requireDetails ? '' : 'loam')
      setCrop('')
    }
    let cancelled = false
    api
      .crops()
      .then((list) => {
        if (cancelled) return
        setCrops(list)
        if (requireDetails) return
        const still = plotRef.current
        if (still) {
          setCrop(still.crop)
        } else {
          setCrop(list[0]?.id ?? '')
        }
      })
      .catch(() => {
        if (!cancelled) setLoadErr(t('plots.cropsError'))
      })
    return () => {
      cancelled = true
    }
  }, [open, plotId, requireDetails])

  useEffect(() => {
    if (!open) return
    const root = panelRef.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pick = () =>
      root
        ? [
            ...root.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ]
        : []
    const first = pick()[0]
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const els = pick()
      if (els.length === 0) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault()
          els[els.length - 1].focus()
        }
      } else if (i === els.length - 1) {
        e.preventDefault()
        els[0].focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    const areaN = Number(area)
    if (!trimmed) {
      setErr(t('plots.nameRequired'))
      return
    }
    if (!crop) {
      setErr(t('plots.cropRequired'))
      return
    }
    if (!Number.isFinite(areaN) || areaN < 1) {
      setErr(t('plots.areaMinimum'))
      return
    }
    if (!irrigation) {
      setErr(t('plots.irrigationRequired'))
      return
    }
    if (!isSoilType(soil)) {
      setErr(t('plots.soilRequired'))
      return
    }
    setBusy(true)
    setErr('')
    const body = {
      name: trimmed,
      crop,
      area_m2: areaN,
      irrigation,
      soil_type: soil,
    }
    try {
      if (plot) {
        const saved = await api.updatePlot(plot.id, body)
        onUpdated?.(saved)
      } else {
        const created = await api.createPlot(farmId, body)
        onCreated?.(created)
      }
      onClose()
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : editing
            ? t('plots.saveError')
            : t('plots.addError'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const cropOptions: Pick<Crop, 'id' | 'label'>[] =
    crop && !crops.some((c) => c.id === crop)
      ? [{ id: crop, label: crop }, ...crops]
      : crops

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest-deep/45"
        aria-label={t('common.closeDialog')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {editing ? t('plots.edit') : t('plots.add')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={submit}>
        {requireDetails && plot ? <EnteredBy record={plot} /> : null}
          <div>
            <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">
              {t('common.name')}
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor={cropId} className="text-xs font-medium text-ink-soft">
              {t('plots.crop')}
            </label>
            <select
              id={cropId}
              value={crop}
              onChange={(e) => setCrop(e.target.value)}
              disabled={busy || cropOptions.length === 0}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
            >
              {requireDetails ? <option value="" disabled>{t('plots.selectCrop')}</option> : null}
              {cropOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={areaId} className="text-xs font-medium text-ink-soft">
              {t('plots.areaM2')}
            </label>
            <input
              id={areaId}
              type="number"
              min={1}
              step={1}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor={irrId} className="text-xs font-medium text-ink-soft">
              {t('plots.irrigation')}
            </label>
            <select
              id={irrId}
              value={irrigation}
              onChange={(e) => setIrrigation(e.target.value)}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
            >
              {irrigation && !IRRIGATION_TYPES.some((i) => i.id === irrigation) ? (
                <option value={irrigation}>{irrigation}</option>
              ) : null}
              {requireDetails ? <option value="" disabled>{t('plots.selectIrrigation')}</option> : null}
              {IRRIGATION_TYPES.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={soilId} className="text-xs font-medium text-ink-soft">
              {t('plots.soilType')}
            </label>
            <select
              id={soilId}
              value={soil}
              onChange={(e) => {
                const next = e.target.value
                if (isSoilType(next)) setSoil(next)
              }}
              disabled={busy}
              aria-describedby={soilHelpId}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
            >
              {requireDetails ? <option value="" disabled>{t('plots.chooseSoil')}</option> : null}
              {SOIL_TYPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <p id={soilHelpId} className="mt-1 text-xs text-ink-soft">
              {t('plots.soilHint')}
            </p>
          </div>
          {loadErr ? (
            <p className="text-sm text-hanko" role="alert">
              {loadErr}
            </p>
          ) : null}
          {err ? (
            <p className="text-sm text-hanko" role="alert">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || (!!loadErr && !crop)}
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? t('common.saving') : editing ? t('common.save') : t('plots.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
