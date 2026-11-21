import { t } from '../../i18n'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, type Job } from '../../api'
import { jobsHref } from '../../lib/view'

export function InviteWorkerDialog({
  open,
  farmId,
  worker,
  onClose,
  onSent,
}: {
  open: boolean
  farmId: number
  worker: { user_id: number; name: string } | null
  onClose: () => void
  onSent: (userId: number) => void
}) {
  const titleId = useId()
  const jobSel = useId()
  const msgId = useId()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [jobId, setJobId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    setJobs(null)
    setErr('')
    setMessage('')
    api
      .farmJobs(farmId)
      .then((rows) => {
        if (!active) return
        const openJobs = rows.filter((j) => j.status === 'open')
        setJobs(openJobs)
        setJobId(openJobs[0] ? String(openJobs[0].id) : '')
      })
      .catch(() => active && setErr(t('jobs.loadOwnJobsError')))
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      active = false
      document.removeEventListener('keydown', onKey)
    }
  }, [open, farmId, onClose])

  if (!open || !worker) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!worker || !jobId) return
    setBusy(true)
    setErr('')
    try {
      await api.inviteWorker(farmId, Number(jobId), { user_id: worker.user_id, message: message.trim() })
      onSent(worker.user_id)
      onClose()
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : t('members.inviteError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-forest-deep/45" aria-label={t('common.closeDialog')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {t('workers.invite')}{' '} {worker.name}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-cream" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {worker.name} is open to work. They get your invitation and can accept it to be hired, or decline.
        </p>
        {jobs && jobs.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-cream p-3 text-sm text-ink">
            {t('workers.noOpenJob')}
            <a href={jobsHref('mine')} className="mt-2 block font-medium text-forest underline-offset-2 hover:underline">
              {t('jobs.post')}
            </a>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="mt-4 space-y-3">
            <div>
              <label htmlFor={jobSel} className="text-xs font-medium text-ink-soft">
                {t('workers.jobChoice')}
              </label>
              <select
                id={jobSel}
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={!jobs || busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                {(jobs ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={msgId} className="text-xs font-medium text-ink-soft">
                {t('workers.inviteIntro')}
              </label>
              <textarea
                id={msgId}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                rows={3}
                disabled={busy}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </div>
            {err ? (
              <p role="alert" className="text-sm text-hanko">
                {err}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded-full border border-line px-4 py-2 text-sm text-ink">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy || !jobId}
                className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? t('common.sending') : t('workers.sendInvite')}
              </button>
            </div>
          </form>
        )}
        {jobs && jobs.length === 0 && err ? <p role="alert" className="mt-2 text-sm text-hanko">{err}</p> : null}
      </div>
    </div>
  )
}
