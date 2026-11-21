import { t } from '../../i18n'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ApiError, api, type ReportReason } from '../../api'
import { formatInt } from '../../lib/status'
import { REPORT_REASONS } from './format'

const DETAILS_MIN = 10
const DETAILS_MAX = 1500
const TOAST_MS = 4000

type ReportDialogProps = {
  open: boolean
  targetUserId: number
  targetName: string
  engagementId?: number | null
  onClose: () => void
}

export function ReportDialog({
  open,
  targetUserId,
  targetName,
  engagementId,
  onClose,
}: ReportDialogProps) {
  const titleId = useId()
  const detailsId = useId()
  const noteId = useId()
  const reasonsId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!open) return
    setReason(null)
    setDetails('')
    setBusy(false)
    setErr('')
  }, [open, targetUserId, engagementId])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(''), TOAST_MS)
    return () => window.clearTimeout(t)
  }, [toast])

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
        e.stopImmediatePropagation()
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

    // Capture so a parent dialog (profile) does not also close on Escape.
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus()
    }
  }, [open])

  function onReasonKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'ArrowDown'
    ) {
      return
    }
    e.preventDefault()
    const i = reason ? REPORT_REASONS.findIndex((r) => r.id === reason) : -1
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    const next =
      REPORT_REASONS[(i + dir + REPORT_REASONS.length) % REPORT_REASONS.length] ??
      REPORT_REASONS[0]
    if (!next) return
    setReason(next.id)
    e.currentTarget.querySelector<HTMLElement>(`[data-reason="${next.id}"]`)?.focus()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!reason) {
      setErr(t('reports.reasonRequired'))
      return
    }
    const trimmed = details.trim()
    if (trimmed.length < DETAILS_MIN) {
      setErr(t('reports.minimum'))
      return
    }
    if (trimmed.length > DETAILS_MAX) {
      setErr(t('reports.detailsLimit'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      await api.createReport({
        target_user_id: targetUserId,
        reason,
        details: trimmed,
        engagement_id:
          engagementId != null && engagementId > 0 ? engagementId : undefined,
      })
      onClose()
      setToast(t('reports.sent'))
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('reports.sendError'))
    } finally {
      setBusy(false)
    }
  }

  if (!open && !toast) return null

  const who = targetName.trim() || t('reports.person')

  return createPortal(
    <>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
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
              <h2 id={titleId} className="min-w-0 font-serif text-2xl text-ink">
                {t('reports.report')}{' '} {who}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream"
                aria-label={t('common.close')}
              >
                <X size={18} />
              </button>
            </div>
            <form className="mt-4 space-y-3" onSubmit={(ev) => void submit(ev)}>
              <div>
                <p className="text-xs font-medium text-ink-soft" id={reasonsId}>
                  {t('common.reason')}
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby={reasonsId}
                  onKeyDown={onReasonKey}
                  className="mt-1.5 flex flex-wrap gap-1.5"
                >
                  {REPORT_REASONS.map((r) => {
                    const checked = reason === r.id
                    return (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        data-reason={r.id}
                        aria-checked={checked}
                        tabIndex={checked || (reason == null && r.id === 'scam') ? 0 : -1}
                        disabled={busy}
                        onClick={() => {
                          setReason(r.id)
                          setErr('')
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                          checked
                            ? 'bg-forest-deep text-white'
                            : 'border border-line bg-white text-ink'
                        }`}
                      >
                        {r.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <label htmlFor={detailsId} className="text-xs font-medium text-ink-soft">
                  {t('common.details')}
                </label>
                <textarea
                  id={detailsId}
                  value={details}
                  onChange={(ev) => {
                    setDetails(ev.target.value)
                    setErr('')
                  }}
                  maxLength={DETAILS_MAX}
                  rows={5}
                  disabled={busy}
                  aria-describedby={noteId}
                  className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
                <p className="mt-1 text-end text-xs text-ink-soft">
                  {formatInt(details.length)}/{formatInt(DETAILS_MAX)}
                </p>
                <p id={noteId} className="mt-1 text-xs text-ink-soft">
                  {t('reports.privacy')}
                </p>
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
                  {busy ? t('common.sending') : t('common.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-[80] w-[min(calc(100%-2rem),24rem)] -translate-x-1/2 rounded-card border border-line bg-forest-deep px-4 py-3 text-center text-sm text-white shadow-shell"
        >
          {toast}
        </div>
      ) : null}
    </>,
    document.body,
  )
}
