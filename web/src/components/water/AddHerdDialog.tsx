import { t } from '../../i18n'
import { AquaEstimate } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, type LivestockHerd, type LivestockSpecies } from '../../api'
import { litresPrecise } from './format'

export type EditableHerd = Pick<LivestockHerd, 'id' | 'label' | 'count' | 'place'>

type AddHerdDialogProps = {
  open: boolean
  farmId: number
  species: LivestockSpecies[]
  taken: string[]
  places?: string[]
  edit?: EditableHerd
  onClose: () => void
  onCreated: (herd: LivestockHerd) => void
}

export function AddHerdDialog({
  open,
  farmId,
  species,
  taken,
  places = [],
  edit,
  onClose,
  onCreated,
}: AddHerdDialogProps) {
  const titleId = useId()
  const speciesId = useId()
  const countId = useId()
  const placeId = useId()
  const helpId = useId()
  const placesId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const available = species.filter((s) => !taken.includes(s.id))
  const [kind, setKind] = useState('')
  const [count, setCount] = useState('')
  const [place, setPlace] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const title = edit ? t('water.editAnimals') : t('water.addAnimals')
  const unavailable = !edit && available.length === 0
  onCloseRef.current = () => { if (!busy) onClose() }

  useEffect(() => {
    if (!open) return
    setErr('')
    setBusy(false)
    setCount(edit ? String(edit.count) : '')
    setPlace(edit?.place ?? '')
    setKind('')
  }, [open, edit])

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
      if (els.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault()
          els[els.length - 1].focus()
        }
      } else if (i === -1 || i === els.length - 1) {
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

  const chosen = available.find((s) => s.id === kind)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!edit && !kind) {
      setErr(t('water.speciesRequired'))
      return
    }
    const n = Number(count)
    if (!Number.isSafeInteger(n) || n < 1) {
      setErr(t('water.animalCountInvalid'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const values = { count: n, place: place.trim() }
      const herd = edit
        ? await api.updateLivestock(farmId, edit.id, values)
        : await api.createLivestock(farmId, { species: kind, ...values })
      onCreated(herd)
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : (edit ? t('water.editAnimalsError') : t('water.addAnimalsError')))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest-deep/45"
        aria-label={t('common.closeDialog')}
        tabIndex={-1}
        onClick={onCloseRef.current}
      />
      <div
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onCloseRef.current}
            className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          {unavailable ? (
            <p className="text-sm text-ink-soft">
              {species.length === 0
                ? t('water.typesError')
                : t('water.allTypesListed')}
            </p>
          ) : (
            <>
              {edit ? <p className="text-sm text-ink-soft">{edit.label}</p> : <div>
                <label htmlFor={speciesId} className="text-xs font-medium text-ink-soft">
                  {t('water.species')}
                </label>
                <select
                  id={speciesId}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                >
                  <option value="" disabled>{t('water.selectSpecies')}</option>
                  {available.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>}
              <div>
                <label htmlFor={countId} className="text-xs font-medium text-ink-soft">
                  {t('water.count')}
                </label>
                <input
                  id={countId}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={busy}
                  aria-describedby={chosen ? helpId : undefined}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
                {chosen ? (
                  <p id={helpId} className="mt-1 text-xs text-ink-soft">
                    {litresPrecise(chosen.litres_per_head_per_day)} {' '}{t('water.perAnimal')}{' '}
                    <AquaEstimate note={t('estimates.animalRequirement')} />
                  </p>
                ) : null}
              </div>
            </>
          )}
          <div>
            <label htmlFor={placeId} className="text-xs font-medium text-ink-soft">{t('water.animalLocation')}</label>
            <input
              id={placeId}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              disabled={busy}
              maxLength={60}
              list={places.length ? placesId : undefined}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            {places.length ? (
              <datalist id={placesId}>
                {places.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>
            ) : null}
          </div>
          {err ? (
            <p className="text-sm text-hanko" role="alert">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCloseRef.current}
              className="rounded-full border border-line px-4 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy || unavailable}
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? t('common.saving') : edit ? t('common.saveChanges') : title}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
