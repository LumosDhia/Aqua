import { t } from '../../i18n'
import { Check } from 'lucide-react'
import { FieldError } from './FieldError'
import { ANIMAL_KINDS, HERD_PLACE_MAX, herdError, type HerdDraft } from './model'

type SpeciesId = (typeof ANIMAL_KINDS)[number]['id']

export function StepAnimals({
  herds,
  attempted,
  busy,
  onToggle,
  onPatch,
}: {
  herds: HerdDraft[]
  attempted: boolean
  busy: boolean
  onToggle: (species: SpeciesId) => void
  onPatch: (species: SpeciesId, values: Partial<HerdDraft>) => void
}) {
  const selected = new Map(herds.map((h) => [h.species, h]))

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {ANIMAL_KINDS.map((kind) => {
        const row = selected.get(kind.id)
        const on = row != null
        const countId = `herd-${kind.id}`
        const placeId = `herd-place-${kind.id}`
        const error = attempted && row ? herdError(row) : ''
        return (
          <li
            key={kind.id}
            data-card=""
            className={`min-w-0 rounded-card border p-3 ${
              on ? 'border-forest bg-leaf-soft/40' : 'border-line bg-white'
            }`}
          >
            <button
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => onToggle(kind.id)}
              className="flex w-full min-w-0 items-center gap-2 text-start"
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  on ? 'border-forest bg-forest text-white' : 'border-mute'
                }`}
              >
                {on ? <Check size={12} strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 break-words text-sm font-medium text-ink">{kind.label}</span>
            </button>
            {row ? (
              <div className="mt-2 space-y-1">
                <label htmlFor={countId} className="text-xs font-medium text-ink-soft">
                  {t('onboarding.animalCount')}
                </label>
                <input
                  id={countId}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${countId}-error` : undefined}
                  inputMode="numeric"
                  value={row.count}
                  onChange={(e) => onPatch(kind.id, { count: e.target.value })}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
                <FieldError id={`${countId}-error`} message={error} />
                <label htmlFor={placeId} className="block pt-1 text-xs font-medium text-ink-soft">{t('onboarding.animalPlace')}</label>
                <input id={placeId} value={row.place} maxLength={HERD_PLACE_MAX}
                  onChange={(e) => onPatch(kind.id, { place: e.target.value })}
                  disabled={busy} className="journey-field" />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
