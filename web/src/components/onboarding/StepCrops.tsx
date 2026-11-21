import { t } from '../../i18n'
import { Check, Plus, Trash2 } from 'lucide-react'
import type { Crop } from '../../api'
import { IRRIGATION_TYPES, SOIL_TYPES } from '../../lib/plotFields'
import { isIrrigation, isSoilType } from '../../api'
import { FieldError } from './FieldError'
import {
  PLOT_MAX,
  convertArea,
  plotAreaError,
  plotCropError,
  type AreaUnit,
  type PlotDraft,
} from './model'

export function StepCrops({
  crops,
  plots,
  attempted,
  busy,
  onToggleCrop,
  onAddField,
  onPatch,
  onRemove,
  note = '',
}: {
  note?: string
  crops: Crop[]
  plots: PlotDraft[]
  attempted: boolean
  busy: boolean
  onToggleCrop: (cropId: string) => void
  onAddField: (cropId: string) => void
  onPatch: (key: string, patch: Partial<PlotDraft>) => void
  onRemove: (key: string) => void
}) {
  const selected = new Set(plots.map((p) => p.crop).filter(Boolean))
  const atMax = plots.length >= PLOT_MAX

  return (
    <div className="space-y-4">
      {note ? <p role="status" className="rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink">{note}</p> : null}
      {crops.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('onboarding.cropsEmpty')}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {crops.map((c) => {
            const on = selected.has(c.id)
            return (
              <li key={c.id} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={busy || (!on && atMax)}
                  onClick={() => onToggleCrop(c.id)}
                  data-card=""
                  className={`flex w-full min-w-0 items-center gap-2 rounded-card border px-3 py-2.5 text-start text-sm ${
                    on ? 'border-forest bg-leaf-soft/40' : 'border-line bg-white hover:bg-cream'
                  } disabled:opacity-60`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      on ? 'border-forest bg-forest text-white' : 'border-mute'
                    }`}
                  >
                    {on ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className="min-w-0 break-words font-medium text-ink">{c.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {plots.length > 0 ? (
        <ul className="space-y-2">
          {plots.map((row, i) => {
            const crop = crops.find((c) => c.id === row.crop)
            const label = crop?.label ?? (row.crop || t('farm.field'))
            const same = plots.filter((p) => p.crop === row.crop)
            const index = same.findIndex((p) => p.key === row.key)
            const title =
              row.name.trim() ||
              (same.length > 1 ? `${label} field ${index + 1}` : label)
            return (
              <li
                key={row.key}
                data-card=""
                className="min-w-0 rounded-card border border-line bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-serif text-base text-ink">{title}</p>
                  <button
                    type="button"
                    onClick={() => onRemove(row.key)}
                    disabled={busy}
                    aria-label={t('common.removeNamed', { name: title })}
                    className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-hanko"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
                <FieldRow
                  row={row}
                  index={i}
                  busy={busy}
                  attempted={attempted}
                  cropAvailable={Boolean(crop)}
                  crops={crops}
                  onPatch={(patch) => onPatch(row.key, patch)}
                />
              </li>
            )
          })}
        </ul>
      ) : null}

      {selected.size > 0 && !atMax ? (
        <div className="flex flex-wrap gap-2">
          {[...selected].map((id) => {
            const crop = crops.find((c) => c.id === id)
            return (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => onAddField(id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream"
              >
                <Plus size={14} aria-hidden />
                {t('onboarding.addAnother')}{' '} {crop?.label ?? 'field'}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function FieldRow({
  row,
  index,
  attempted,
  cropAvailable,
  crops,
  busy,
  onPatch,
}: {
  crops: Crop[]
  row: PlotDraft
  index: number
  attempted: boolean
  cropAvailable: boolean
  busy: boolean
  onPatch: (patch: Partial<PlotDraft>) => void
}) {
  const areaId = `plot-area-${index}`
  const irrId = `plot-irr-${index}`
  const irrHelpId = `plot-irr-help-${index}`
  const soilId = `plot-soil-${index}`
  const soilHelpId = `plot-soil-help-${index}`
  const unitId = `plot-unit-${index}`
  const areaError = attempted ? plotAreaError(row) : ''
  const cropId = `plot-crop-${index}`
  const cropError = !attempted || cropAvailable ? '' : row.crop
    ? t('onboarding.cropUnavailable')
    : plotCropError(row)

  function setUnit(next: AreaUnit) {
    onPatch({ unit: next, area: convertArea(row.area, row.unit, next) })
  }

  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {cropError ? <p className="sm:col-span-2 text-sm text-hanko" role="alert">{cropError}</p> : null}
      {row.fromRead ? (
        <div className="min-w-0 sm:col-span-2">
          <label htmlFor={cropId} className="text-xs font-medium text-ink-soft">{t('plots.crop')}</label>
          <select
            id={cropId}
            value={row.crop}
            aria-invalid={Boolean(cropError)}
            onChange={(e) => onPatch({ crop: e.target.value })}
            disabled={busy}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">{t('plots.chooseCrop')}</option>
            {crops.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
      ) : null}
      <div className="min-w-0">
        <label htmlFor={areaId} className="text-xs font-medium text-ink-soft">
          {t('plots.area')}
        </label>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <input
            id={areaId}
            aria-invalid={Boolean(areaError)}
            aria-describedby={areaError ? `${areaId}-error` : undefined}
            inputMode="decimal"
            value={row.area}
            onChange={(e) => onPatch({ area: e.target.value })}
            disabled={busy}
            className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          />
          <div
            role="group"
            aria-label={t('common.areaUnit')}
            id={unitId}
            className="inline-flex shrink-0 items-center rounded-full border border-line bg-cream p-0.5 text-xs"
          >
            <button
              type="button"
              aria-pressed={row.unit === 'm2'}
              disabled={busy}
              onClick={() => setUnit('m2')}
              className={`rounded-full px-2.5 py-1 ${
                row.unit === 'm2' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
              }`}
            >
              m²
            </button>
            <button
              type="button"
              aria-pressed={row.unit === 'ha'}
              disabled={busy}
              onClick={() => setUnit('ha')}
              className={`rounded-full px-2.5 py-1 ${
                row.unit === 'ha' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
              }`}
            >
              ha
            </button>
          </div>
        </div>
        <FieldError id={`${areaId}-error`} message={areaError} />
      </div>
      <div className="min-w-0">
        <label htmlFor={irrId} className="text-xs font-medium text-ink-soft">
          {t('onboarding.irrigationOptional')}
        </label>
        <select
          id={irrId}
          value={row.irrigation}
          onChange={(e) => {
            const value = e.target.value
            if (value === '' || isIrrigation(value)) onPatch({ irrigation: value })
          }}
          disabled={busy}
          aria-describedby={irrHelpId}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        >
          <option value="">{t('onboarding.chooseIfKnown')}</option>
          {IRRIGATION_TYPES.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
        <p id={irrHelpId} className="mt-1 text-xs text-ink-soft">
          {t('onboarding.dripHint')}
        </p>
      </div>
      <div className="min-w-0 sm:col-span-2">
        <label htmlFor={soilId} className="text-xs font-medium text-ink-soft">
          {t('onboarding.soilOptional')}
        </label>
        <select
          id={soilId}
          value={row.soil_type}
          onChange={(e) => {
            const next = e.target.value
            if (next === '' || isSoilType(next)) onPatch({ soil_type: next })
          }}
          disabled={busy}
          aria-describedby={soilHelpId}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        >
          <option value="">{t('onboarding.chooseIfKnown')}</option>
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
    </div>
  )
}
