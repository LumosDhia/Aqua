import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, type WaterKind, type WaterSource, type WaterSourceBody } from '../../api'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import { isWaterKind, WATER_KINDS } from './kinds'

const NAME_MAX = 120
const NOTES_MAX = 300

type SourceDialogProps = {
  open: boolean
  farmId: number
  source: WaterSource | null
  onClose: () => void
  onSaved: (source: WaterSource) => void
}

function parseLitres(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return Number.NaN
  return n
}

export function SourceDialog({ open, farmId, source, onClose, onSaved }: SourceDialogProps) {
  const titleId = useId()
  const kindId = useId()
  const nameId = useId()
  const capId = useId()
  const capHelpId = useId()
  const levelId = useId()
  const refillId = useId()
  const refillHelpId = useId()
  const notesId = useId()
  const m3HelpId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const editing = source != null
  const [kind, setKind] = useState<WaterKind>('tank')
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [level, setLevel] = useState('')
  const [refill, setRefill] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setBusy(false)
    if (source) {
      setKind(source.kind)
      setName(source.name)
      setCapacity(source.capacity_l == null ? '' : String(source.capacity_l))
      setLevel(source.level_recorded !== true ? '' : String(source.level_l))
      setRefill(source.refill_recorded !== true ? '' : String(source.refill_l_per_day))
      setNotes(source.notes)
    } else {
      setKind('tank')
      setName('')
      setCapacity('')
      setLevel('')
      setRefill('')
      setNotes('')
    }
  }, [open, source])

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
    if (!trimmed) {
      setErr(t('common.nameRequired'))
      return
    }
    if (trimmed.length > NAME_MAX) {
      setErr(t('common.nameLimit'))
      return
    }
    const notesTrim = notes.trim()
    if (notesTrim.length > NOTES_MAX) {
      setErr(t('water.notesLimit'))
      return
    }
    const capN = parseLitres(capacity)
    if (capN != null && (Number.isNaN(capN) || capN < 0)) {
      setErr(t('water.capacityInvalid'))
      return
    }
    const levelRaw = parseLitres(level)
    if (levelRaw != null && (Number.isNaN(levelRaw) || levelRaw < 0)) {
      setErr(t('water.levelInvalid'))
      return
    }
    const refillRaw = parseLitres(refill)
    if (refillRaw != null && (Number.isNaN(refillRaw) || refillRaw < 0)) {
      setErr(t('water.refillInvalid'))
      return
    }
    if (capN != null && levelRaw != null && levelRaw > capN) {
      setErr(t('water.levelAboveCapacity'))
      return
    }
    setBusy(true)
    setErr('')
    const body: WaterSourceBody = {
      kind,
      name: trimmed,
      capacity_l: capN,
      level_l: levelRaw ?? undefined,
      refill_l_per_day: refillRaw ?? undefined,
      level_recorded: levelRaw != null,
      refill_recorded: refillRaw != null,
      notes: notesTrim,
    }
    try {
      const saved = source
        ? await api.updateWaterSource(farmId, source.id, body)
        : await api.createWaterSource(farmId, body)
      onSaved(saved)
      onClose()
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : editing
            ? t('water.saveSourceError')
            : t('water.addSourceError'),
      )
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
            {editing ? t('water.editSource') : t('water.addSource')}
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
        {source ? <EnteredBy record={source} /> : null}
          <div>
            <label htmlFor={kindId} className="text-xs font-medium text-ink-soft">
              {t('water.kind')}
            </label>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <WaterSourceIcon kind={kind} size={18} className="shrink-0 text-forest" />
              <select
                id={kindId}
                value={kind}
                onChange={(e) => {
                  const next = e.target.value
                  if (isWaterKind(next)) setKind(next)
                }}
                disabled={busy}
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                {WATER_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">
              {t('common.name')}
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              required
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor={capId} className="text-xs font-medium text-ink-soft">
              {t('water.capacity')}
            </label>
            <input
              id={capId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              disabled={busy}
              aria-describedby={`${capHelpId} ${m3HelpId}`}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p id={capHelpId} className="mt-1 text-xs text-ink-soft">
              {t('water.networkCapacityHelp')}
            </p>
          </div>
          <div>
            <label htmlFor={levelId} className="text-xs font-medium text-ink-soft">
              {t('water.currentLevel')}
            </label>
            <input
              id={levelId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              disabled={busy}
              aria-describedby={m3HelpId}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor={refillId} className="text-xs font-medium text-ink-soft">
              {t('water.refill')}
            </label>
            <input
              id={refillId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={refill}
              onChange={(e) => setRefill(e.target.value)}
              disabled={busy}
              aria-describedby={`${refillHelpId} ${m3HelpId}`}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p id={refillHelpId} className="mt-1 text-xs text-ink-soft">
              {t('water.refillHelp')}
            </p>
          </div>
          <p id={m3HelpId} className="text-xs text-ink-soft">
            1 m³ = 1,000 L
          </p>
          <div>
            <label htmlFor={notesId} className="text-xs font-medium text-ink-soft">
              {t('common.notes')}
            </label>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={NOTES_MAX}
              rows={3}
              disabled={busy}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </div>
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
              disabled={busy}
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? t('common.saving') : editing ? t('common.save') : t('water.addSource')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
