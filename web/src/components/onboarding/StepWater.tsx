import { t } from '../../i18n'
import { Trash2 } from 'lucide-react'
import type { WaterKind } from '../../api'
import { WATER_KINDS, waterKindMeta } from '../water/kinds'
import { FieldError } from './FieldError'
import { SOURCE_MAX, sourceErrors, type SourceDraft } from './model'

export function StepWater({
  sources,
  attempted,
  busy,
  onAdd,
  onPatch,
  onRemove,
}: {
  sources: SourceDraft[]
  attempted: boolean
  busy: boolean
  onAdd: (kind: WaterKind) => void
  onPatch: (key: string, patch: Partial<SourceDraft>) => void
  onRemove: (key: string) => void
}) {
  const atMax = sources.length >= SOURCE_MAX
  const helpId = 'water-m3-help'

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-ink-soft">{t('onboarding.waterAdd')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {WATER_KINDS.map((k) => {
            const Icon = k.Icon
            return (
              <button
                key={k.id}
                type="button"
                disabled={busy || atMax}
                title={atMax ? t('onboarding.waterLimit') : t('onboarding.addSourceType', { source: k.label })}
                onClick={() => onAdd(k.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream disabled:opacity-60"
              >
                <Icon size={14} aria-hidden />
                {k.label}
              </button>
            )
          })}
        </div>
      </div>

      {sources.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('onboarding.waterEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {sources.map((row, i) => {
            const meta = waterKindMeta(row.kind)
            const Icon = meta.Icon
            const capId = `src-cap-${i}`
            const levelId = `src-level-${i}`
            const refillId = `src-refill-${i}`
            const nameId = `src-name-${i}`
            const errors = sourceErrors(row)
            const measurements = [
              { field: 'capacity', id: capId, label: t('water.capacity') },
              { field: 'level', id: levelId, label: t('water.currentLevel') },
              { field: 'refill', id: refillId, label: t('water.dailyRefill') },
            ] as const
            return (
              <li
                key={row.key}
                data-card=""
                className="min-w-0 rounded-card border border-line bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 font-serif text-base text-ink">
                    <Icon size={16} aria-hidden className="shrink-0 text-forest" />
                    <span className="truncate">{meta.label}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onRemove(row.key)}
                    disabled={busy}
                    aria-label={t('common.removeNamed', { name: meta.label })}
                    className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-hanko"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="min-w-0 sm:col-span-2">
                    <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">
                      {t('onboarding.nameOptional')}
                    </label>
                    <input
                      id={nameId}
                      value={row.name}
                      onChange={(e) => onPatch(row.key, { name: e.target.value })}
                      maxLength={120}
                      placeholder={meta.label}
                      disabled={busy}
                      className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
                    />
                  </div>
                  {measurements.map(({ field, id, label }) => {
                    const error = attempted ? errors[field] : ''
                    return (
                      <div className="min-w-0" key={field}>
                        <label htmlFor={id} className="text-xs font-medium text-ink-soft">{label} {' '}{t('common.optional')}</label>
                        <input id={id} inputMode="decimal" value={row[field]}
                          onChange={(e) => onPatch(row.key, { [field]: e.target.value })}
                          disabled={busy} aria-invalid={Boolean(error)}
                          aria-describedby={error ? `${id}-error ${helpId}` : helpId}
                          className="journey-field mt-1" />
                        <FieldError id={`${id}-error`} message={error} />
                      </div>
                    )
                  })}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p id={helpId} className="text-xs text-ink-soft">
        1 m³ = 1,000 L
      </p>
    </div>
  )
}
