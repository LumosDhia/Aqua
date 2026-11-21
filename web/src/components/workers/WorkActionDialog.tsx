import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, type Engagement } from '../../api'

const NOTE_MAX = 600
const REASON_MIN = 5
const REASON_MAX = 600

export type WorkAction = 'finish' | 'disapprove' | 'upgrade'

type WorkActionDialogProps = {
  open: boolean
  mode: WorkAction | null
  engagement: Engagement | null
  onClose: () => void
  onSaved: (mode: WorkAction, fromId: number) => void
}

function workerName(eng: Engagement | null): string {
  return eng?.worker?.name?.trim() || t('workers.workerFallback')
}

export function WorkActionDialog({
  open,
  mode,
  engagement,
  onClose,
  onSaved,
}: WorkActionDialogProps) {
  const titleId = useId()
  const fieldId = useId()
  const warnId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setNote('')
    setReason('')
    setBusy(false)
    setErr('')
  }, [open, mode, engagement?.id])

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
          els[els.length - 1]?.focus()
        }
      } else if (i === els.length - 1) {
        e.preventDefault()
        els[0]?.focus()
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
    if (!engagement || !mode) return
    if (mode === 'disapprove') {
      const trimmed = reason.trim()
      if (trimmed.length < REASON_MIN) {
        setErr(t('workers.reasonMin', { minimum: REASON_MIN }))
        return
      }
      if (trimmed.length > REASON_MAX) {
        setErr(t('workers.reasonMax', { maximum: REASON_MAX }))
        return
      }
    }
    if (mode === 'finish' && note.trim().length > NOTE_MAX) {
      setErr(t('workers.noteMax', { maximum: NOTE_MAX }))
      return
    }
    setBusy(true)
    setErr('')
    try {
      if (mode === 'finish') {
        const trimmed = note.trim()
        await api.finishEngagement(engagement.id, trimmed || undefined)
      } else if (mode === 'disapprove') {
        await api.disapproveEngagement(engagement.id, reason.trim())
      } else {
        await api.upgradeEngagement(engagement.id)
      }
      onSaved(mode, engagement.id)
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('workers.workUpdateError'))
    } finally {
      setBusy(false)
    }
  }

  if (!open || !mode || !engagement) return null

  const name = workerName(engagement)
  const heading =
    mode === 'finish'
      ? t('workers.finish')
      : mode === 'disapprove'
        ? t('workers.disapproveTitle')
        : t('workers.offer')
  const submitLabel =
    mode === 'finish' ? t('workers.finish') : mode === 'disapprove' ? t('workers.disapprove') : t('workers.offer')

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
            {heading}
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
        <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
          {engagement ? <EnteredBy record={engagement} /> : null}
          {mode === 'upgrade' ? (
            <p className="text-sm text-ink">
              {t('workers.offerSummary', { name, title: engagement.title })}
            </p>
          ) : (
            <p className="text-sm text-ink">
              {name}
              {engagement.title ? ` · ${engagement.title}` : ''}
            </p>
          )}
          {mode === 'finish' ? (
            <div>
              <label htmlFor={fieldId} className="text-xs font-medium text-ink-soft">
                {t('workers.shortNote')}
              </label>
              <textarea
                id={fieldId}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={NOTE_MAX}
                rows={4}
                disabled={busy}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1 text-end text-xs text-ink-soft">
                {note.trim().length}/{NOTE_MAX}
              </p>
            </div>
          ) : null}
          {mode === 'disapprove' ? (
            <div>
              <label htmlFor={fieldId} className="text-xs font-medium text-ink-soft">
                {t('common.reason')}
              </label>
              <textarea
                id={fieldId}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={REASON_MAX}
                minLength={REASON_MIN}
                rows={4}
                required
                disabled={busy}
                aria-describedby={warnId}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
              <p id={warnId} className="mt-1 text-xs text-ink-soft">
                {t('workers.reasonVisible')}
              </p>
              <p className="mt-1 text-end text-xs text-ink-soft">
                {reason.trim().length}/{REASON_MAX}
              </p>
            </div>
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
              disabled={busy}
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? t('common.saving') : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
