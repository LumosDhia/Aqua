import { t } from '../../i18n'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, type Worker } from '../../api'

const NAME_MAX = 120
const JOB_MAX = 80

type AddWorkerDialogProps = {
  open: boolean
  farmId: number
  onClose: () => void
  onCreated: (worker: Worker) => void
}

export function AddWorkerDialog({ open, farmId, onClose, onCreated }: AddWorkerDialogProps) {
  const titleId = useId()
  const nameId = useId()
  const jobId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [name, setName] = useState('')
  const [job, setJob] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setErr('')
    setName('')
    setJob('')
    setBusy(false)
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
    const jobTrim = job.trim()
    if (!trimmed) {
      setErr(t('common.nameRequired'))
      return
    }
    if (trimmed.length > NAME_MAX) {
      setErr(t('common.nameLimit'))
      return
    }
    if (jobTrim.length > JOB_MAX) {
      setErr(t('workers.roleLimit'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const worker = await api.createWorker(farmId, {
        name: trimmed,
        role_label: jobTrim,
      })
      onCreated(worker)
      onClose()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('workers.addError'))
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
            {t('workers.addTitle')}
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
          <div>
            <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">
              {t('common.name')}
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX}
              disabled={busy}
              autoComplete="name"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </div>
          <div>
            <label htmlFor={jobId} className="text-xs font-medium text-ink-soft">
              {t('workers.role')}
            </label>
            <input
              id={jobId}
              value={job}
              onChange={(e) => setJob(e.target.value)}
              maxLength={JOB_MAX}
              placeholder={t('workers.rolePlaceholder')}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
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
              {busy ? t('common.adding') : t('workers.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
