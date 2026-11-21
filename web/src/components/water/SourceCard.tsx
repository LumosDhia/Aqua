import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { ApiError, api, type WaterSource } from '../../api'
import { formatInt } from '../../lib/status'
import {
  fillBarClass,
  fillChip,
  litresPrecise,
} from './format'
import { waterKindMeta } from './kinds'

export function SourceCard({
  farmId,
  source,
  canManage,
  canSetLevel,
  confirm,
  highlight,
  onAskRemove,
  onCancelRemove,
  onRemoved,
  onChanged,
  onEdit,
}: {
  farmId: number
  source: WaterSource
  canManage: boolean
  canSetLevel: boolean
  confirm: boolean
  highlight: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemoved: () => void
  onChanged: (next: WaterSource) => void
  onEdit: () => void
}) {
  const meta = waterKindMeta(source.kind)
  const Icon = meta.Icon
  const hasLevel = source.level_recorded === true
  const [editingLevel, setEditingLevel] = useState(false)
  const [removeErr, setRemoveErr] = useState('')

  useEffect(() => {
    setEditingLevel(false)
    setRemoveErr('')
  }, [source.id])

  async function onRemove() {
    setRemoveErr('')
    try {
      await api.deleteWaterSource(farmId, source.id)
      onRemoved()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onRemoved()
        return
      }
      setRemoveErr(error instanceof ApiError ? error.message : t('water.removeSourceError'))
    }
  }

  return (
    <li
      data-card=""
      className={`min-w-0 rounded-card border border-line p-3 ${
        highlight ? 'bg-leaf-soft/40 ring-2 ring-leaf' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-forest"
          aria-hidden
        >
          <Icon size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-lg leading-tight text-ink">{source.name}</p>
              <p className="mt-0.5 truncate text-xs text-ink-soft">{meta.label}</p>
            </div>
            {canManage && !confirm ? (
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => {
                    setEditingLevel(false)
                    onEdit()
                  }}
                  aria-label={t('common.editNamed', { name: source.name })}
                  title={t('common.editNamed', { name: source.name })}
                  className="rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-forest"
                >
                  <Pencil size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={onAskRemove}
                  aria-label={t('common.removeNamed', { name: source.name })}
                  title={t('common.removeNamed', { name: source.name })}
                  className="rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-hanko"
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
            ) : null}
          </div>

          {source.capacity_l != null && hasLevel && source.fill_percent != null ? (
            <FillBar
              name={source.name}
              level={source.level_l}
              capacity={source.capacity_l}
              apiPct={source.fill_percent}
              source={source}
            />
          ) : (
            <p className="mt-2 text-sm text-ink">
              {source.capacity_l != null ? t('water.capacityCaption', { capacity: litresPrecise(source.capacity_l) }) : t('water.capacityMissing')}
              {hasLevel ? t('water.currentLevelValue', { volume: litresPrecise(source.level_l) }) : t('water.noLevelReading')}
            </p>
          )}

          {source.level_entered_by ? <EnteredBy record={{ entered_by: source.level_entered_by }} verb="Recorded" /> : null}

          <p className="mt-1 text-xs text-ink-soft">
            {source.refill_recorded !== true ? t('water.dailyRefillMissing') : t('water.dailyRefillValue', { volume: litresPrecise(source.refill_l_per_day) })}
          </p>

          {source.notes.trim() ? (
            <p className="mt-1 line-clamp-2 text-xs break-words text-ink-soft">{source.notes}</p>
          ) : null}

          <EnteredBy record={source} />

          {removeErr ? (
            <p className="mt-2 text-sm text-hanko" role="alert">
              {removeErr}
            </p>
          ) : null}

          {canManage && confirm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <p className="text-ink">{t('common.remove')}{' '} {source.name}?</p>
              <button
                type="button"
                onClick={() => void onRemove()}
                className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
              >
                {t('common.yes')}
              </button>
              <button
                type="button"
                onClick={onCancelRemove}
                className="rounded-full border border-line px-3 py-1 text-xs"
              >
                {t('common.no')}
              </button>
            </div>
          ) : null}

          {!confirm && (canSetLevel || !hasLevel) ? (
            editingLevel ? (
              <LevelEditor
                farmId={farmId}
                source={source}
                onCancel={() => setEditingLevel(false)}
                onSaved={(next) => {
                  setEditingLevel(false)
                  onChanged(next)
                }}
              />
            ) : (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setEditingLevel(true)}
                  disabled={!canSetLevel}
                  title={!canSetLevel ? t('water.recordPermission') : undefined}
                  className="inline-flex items-center rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {hasLevel ? t('water.updateLevel') : t('water.recordLevel')}
                </button>
              </div>
            )
          ) : null}
        </div>
      </div>
    </li>
  )
}

function FillBar({
  name,
  level,
  capacity,
  apiPct,
  source,
}: {
  name: string
  level: number
  capacity: number
  apiPct: number
  source: WaterSource
}) {
  const rounded = Math.round(Math.min(100, Math.max(0, apiPct)))
  const chip = fillChip(rounded)
  const valuetext =
    rounded < 20
      ? t('water.fillLow', { percent: rounded })
      : rounded >= 95
        ? t('water.fillFull', { percent: rounded })
        : `${rounded} percent`

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="progressbar"
          aria-label={t('water.fillLabel', { source: name })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={rounded}
          aria-valuetext={valuetext}
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-cream-deep"
        >
          <div
            className={`h-full ${fillBarClass(rounded)}`}
            style={{ width: `${rounded}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-ink">{formatInt(rounded)}%</span>
        <AquaEstimate record={source} note={t('estimates.storage')} />
        {chip ? (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}>
            {chip.label}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink">
        {litresPrecise(level)} of {litresPrecise(capacity)}
      </p>
    </div>
  )
}

function LevelEditor({
  farmId,
  source,
  onCancel,
  onSaved,
}: {
  farmId: number
  source: WaterSource
  onCancel: () => void
  onSaved: (next: WaterSource) => void
}) {
  const inputId = useId()
  const sliderId = useId()
  const errId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const capacity = source.capacity_l
  const [raw, setRaw] = useState(source.level_recorded !== true ? '' : String(source.level_l))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancelRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const parsed = Number(raw)
  const sliderValue = raw.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : null

  async function onSave(e: FormEvent) {
    e.preventDefault()
    const n = Number(raw)
    if (!raw.trim() || !Number.isFinite(n) || n < 0) {
      setErr(t('water.levelRequired'))
      return
    }
    if (capacity != null && n > capacity) {
      setErr(t('water.levelAboveCapacity'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const next = await api.setWaterLevel(farmId, source.id, n)
      onSaved(next)
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('water.updateLevelError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mt-3 space-y-2" onSubmit={onSave} aria-label={t('water.updateLevel')}>
      <div>
        <label htmlFor={inputId} className="text-xs font-medium text-ink-soft">
          {t('water.currentLevel')}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="number"
          min={0}
          max={capacity ?? undefined}
          step="any"
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={busy}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? errId : undefined}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        />
      </div>
      {capacity != null && capacity > 0 && sliderValue != null ? (
        <div>
          <label htmlFor={sliderId} className="sr-only">
            Level from 0 to {formatInt(capacity)} litres
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={capacity}
            step={1}
            value={Math.min(capacity, Math.max(0, sliderValue))}
            onChange={(e) => setRaw(e.target.value)}
            disabled={busy}
            className="w-full accent-forest"
          />
        </div>
      ) : null}
      {err ? (
        <p id={errId} className="text-sm text-hanko" role="alert">
          {err}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-line px-3 py-1 text-xs disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
