import { t } from '../i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { ApiError, api, type AccountType, type User } from '../api'
import { VIEW_HREF } from '../lib/view'

type SwitchSideDialogProps = {
  open: boolean
  target: AccountType
  onClose: () => void
  onDone: (user: User) => void
}

export function SwitchSideDialog({ open, target, onClose, onDone }: SwitchSideDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  busyRef.current = busy
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setErr('')
  }, [open])

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
        if (!busyRef.current) onCloseRef.current()
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

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      prev?.focus()
    }
  }, [open])

  async function confirm() {
    setBusy(true)
    setErr('')
    try {
      const result = await api.setAccountType(target)
      const me = await api.me()
      const next: User = {
        ...me,
        account_type: result.account_type,
        farm_count: result.farm_count,
      }
      const hash = window.location.hash
      if (hash !== VIEW_HREF.dashboard && hash !== '' && hash !== '#') {
        window.location.hash = VIEW_HREF.dashboard
      }
      onDone(next)
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('shell.switchError'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const toFarmer = target === 'farmer'
  const title = toFarmer ? t('shell.switchFarmer') : t('shell.switchWorker')
  const action = toFarmer ? t('shell.switchFarmer') : t('shell.switchWorker')

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest-deep/45"
        aria-label={t('common.closeDialog')}
        disabled={busy}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 font-serif text-2xl text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream disabled:opacity-60"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        {toFarmer ? (
          <p className="mt-3 text-sm text-ink">
            {t('shell.switchFarmerHelp')}
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink">
            {t('shell.switchWorkerHelp')}
          </p>
        )}
        {err ? (
          <p className="mt-3 text-sm text-hanko" role="alert">
            {err}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? t('common.switching') : action}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
