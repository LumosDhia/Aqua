import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Send, X } from 'lucide-react'
import {
  ApiError,
  api,
  type Job,
  type JobApplication,
  type MarketMeta,
} from '../../api'
import { formatInt } from '../../lib/status'
import { VIEW_HREF } from '../../lib/view'
import { Chip } from '../market/Chip'
import {
  applicationStatusMeta,
  distanceLine,
  formatDay,
  hiredLine,
  jobDates,
  jobStatusMeta,
  kindChip,
  kindChipClass,
  osmHref,
  payLine,
} from './format'


const MSG_MIN = 5
const MSG_MAX = 1000

type JobDetailDialogProps = {
  open: boolean
  jobId: number | null
  farmId: number | null
  meta: MarketMeta | null
  profilePrivate?: boolean
  onClose: () => void
  onApplied?: () => void
  onWithdrawn?: () => void
}

export function JobDetailDialog({
  open,
  jobId,
  farmId,
  meta,
  profilePrivate = false,
  onClose,
  onApplied,
  onWithdrawn,
}: JobDetailDialogProps) {
  const titleId = useId()
  const msgId = useId()
  const privateHelpId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [job, setJob] = useState<Job | null>(null)
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [applied, setApplied] = useState<JobApplication | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setJob(null)
    setReady(false)
    setLoadErr('')
    setMessage('')
    setBusy(false)
    setSendErr('')
    setApplied(null)
  }, [open, jobId])

  useEffect(() => {
    if (!open || jobId == null) return
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')

    api
      .job(jobId, farmId ?? undefined)
      .then((row) => {
        if (cancelled || my !== seqRef.current) return
        setJob(row)
        setApplied(row.my_application ?? null)
        setLoadErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setJob(null)
        if (e instanceof ApiError && e.status === 404) {
          setLoadErr(t('jobs.jobMissing'))
        } else {
          setLoadErr(e instanceof ApiError ? e.message : t('jobs.loadJobError'))
        }
      })
      .finally(() => {
        if (!cancelled && my === seqRef.current) setReady(true)
      })

    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [open, jobId, farmId])

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

  async function onSend(e: FormEvent) {
    e.preventDefault()
    if (jobId == null) return
    if (profilePrivate) {
      setSendErr(t('jobs.privateApply'))
      return
    }
    const trimmed = message.trim()
    if (trimmed.length < MSG_MIN) {
      setSendErr(t('common.messageMinimum'))
      return
    }
    if (trimmed.length > MSG_MAX) {
      setSendErr(t('common.messageLimit'))
      return
    }
    setBusy(true)
    setSendErr('')
    try {
      const application = await api.applyToJob(jobId, trimmed)
      setApplied(application)
      setJob((row) => (row ? { ...row, my_application: application } : row))
      onApplied?.()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSendErr(error.message)
        try {
          const row = await api.job(jobId, farmId ?? undefined)
          setJob(row)
          if (row.my_application) {
            setApplied(row.my_application)
            onApplied?.()
          }
        } catch {
          /* keep the 409 message */
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setSendErr(t('jobs.jobMissing'))
      } else {
        setSendErr(error instanceof ApiError ? error.message : t('jobs.applicationSendError'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function onWithdraw() {
    const current = applied ?? job?.my_application ?? null
    if (!current) return
    setBusy(true)
    setSendErr('')
    try {
      await api.withdrawJobApplication(current.id)
      const next: JobApplication = { ...current, status: 'withdrawn' }
      setApplied(next)
      setJob((row) => (row ? { ...row, my_application: next } : row))
      onWithdrawn?.()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setSendErr(t('jobs.applicationMissing'))
      } else {
        setSendErr(error instanceof ApiError ? error.message : t('jobs.withdrawError'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const application = applied ?? job?.my_application ?? null
  const status = job ? jobStatusMeta(job.status) : null
  const dates = job ? jobDates(job.kind, job.start_date, job.end_date) : null
  const distance = job ? distanceLine(job.distance_km) : null
  const appChip = application ? applicationStatusMeta(application.status) : null
  const gov = job
    ? (meta?.governorates ?? []).find((g) => g.name === job.governorate)
    : undefined

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
        className="relative z-10 max-h-[90dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="min-w-0 font-serif text-2xl text-ink">
            {job?.title ?? t('cv.experience.job')}
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

        {job ? <EnteredBy record={job} /> : null}
        {!ready ? (
          <div className="mt-4 space-y-3" aria-hidden>
            <div className="aqua-skel h-4 w-2/3 rounded" />
            <div className="aqua-skel h-4 w-1/2 rounded" />
            <div className="aqua-skel h-20 w-full rounded" />
          </div>
        ) : loadErr ? (
          <p className="mt-4 text-sm text-hanko" role="alert">
            {loadErr}
          </p>
        ) : job ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm text-ink-soft">
                {job.farm.name}
                {job.farm.region ? ` · ${job.farm.region}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip className={kindChipClass(job.kind)}>{kindChip(job.kind)}</Chip>
                {job.status !== 'open' && status ? (
                  <Chip className={status.className}>{status.label}</Chip>
                ) : null}
                <Chip className="bg-ochre-soft/60 text-ink">
                  {payLine(job.pay_mode, job.pay_amount, job.pay_unit)}
                </Chip>
                {dates ? <Chip>{dates}</Chip> : null}
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('jobs.dates')}</dt>
                <dd className="text-ink">{dates ?? t('common.notSet')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('jobs.workersNeeded')}</dt>
                <dd className="text-ink">
                  {formatInt(job.workers_needed)}
                  {job.accepted_count > 0
                    ? ` · ${hiredLine(job.accepted_count, job.workers_needed)}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('common.skills')}</dt>
                <dd className="text-ink">
                  {job.skills.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5">
                      {job.skills.map((s, i) => (
                        <Chip key={`${s}-${i}`}>{s}</Chip>
                      ))}
                    </span>
                  ) : (
                    t('common.notSet')
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('common.location')}</dt>
                <dd className="text-ink">
                  {[job.governorate, job.address_text].filter(Boolean).join(' · ') || t('common.notSet')}
                </dd>
              </div>
              {job.radius_km != null ? (
                <div>
                  <dt className="text-xs font-medium text-ink-soft">{t('jobs.reach')}</dt>
                  <dd className="text-ink">{t('jobs.within', { distance: formatInt(job.radius_km) })}</dd>
                </div>
              ) : null}
            </dl>

            {gov ? (
              <p className="text-sm">
                <a
                  href={osmHref(gov.lat, gov.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-forest underline-offset-2 hover:underline"
                >
                  {t('common.mapLink')}
                  <ExternalLink size={14} aria-hidden />
                </a>
                {distance ? <AquaEstimate record={job} note={t('estimates.distance')} /> : null}
                {distance ? <span className="mt-1 block text-ink-soft">{distance}</span> : null}
              </p>
            ) : distance ? (
              <p className="text-sm text-ink-soft">{distance}{' '}<AquaEstimate record={job} note={t('estimates.distance')} /></p>
            ) : null}

            {job.description.trim() ? (
              <p className="whitespace-pre-wrap text-sm break-words text-ink">
                {job.description}
              </p>
            ) : null}

            <div className="border-t border-line pt-4">
              {job.is_mine ? (
                <p className="text-sm text-ink-soft">{t('jobs.yours')}</p>
              ) : application ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <p className="text-ink">{t('jobs.appliedOn')}{' '} {formatDay(application.created_at)}</p>
                    <EnteredBy record={application} />
                    {appChip ? (
                      <Chip className={appChip.className}>{appChip.label}</Chip>
                    ) : null}
                  </div>
                  {application.status === 'pending' ? (
                    <button
                      type="button"
                      onClick={() => void onWithdraw()}
                      disabled={busy}
                      className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink disabled:opacity-60"
                    >
                      {busy ? t('jobs.withdrawing') : t('jobs.withdraw')}
                    </button>
                  ) : null}
                  {sendErr ? (
                    <p className="text-sm text-hanko" role="alert">
                      {sendErr}
                    </p>
                  ) : null}
                </div>
              ) : (
                <form onSubmit={(e) => void onSend(e)} className="space-y-2">
                  <label htmlFor={msgId} className="text-xs font-medium text-ink-soft">
                    {t('jobs.introPrompt')}
                  </label>
                  <textarea
                    id={msgId}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={MSG_MAX}
                    minLength={MSG_MIN}
                    rows={4}
                    disabled={busy}
                    className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                  />
                  <p className="text-end text-xs text-ink-soft">
                    {message.trim().length}/{MSG_MAX}
                  </p>
                  {profilePrivate ? (
                    <p id={privateHelpId} className="text-sm text-ink-soft">
                      {t('jobs.privateApply')}{' '}
                      <a
                        href={VIEW_HREF.profile}
                        className="font-medium text-forest underline-offset-2 hover:underline"
                      >
                        {t('common.openProfile')}
                      </a>
                    </p>
                  ) : null}
                  {sendErr ? (
                    <p className="text-sm text-hanko" role="alert">
                      {sendErr}
                    </p>
                  ) : null}
                  <span title={profilePrivate ? t('jobs.privateApply') : undefined} className="inline-flex align-middle">
                    <button
                      type="submit"
                      disabled={busy || profilePrivate || message.trim().length < MSG_MIN}
                      title={profilePrivate ? t('jobs.privateApply') : undefined}
                      aria-describedby={profilePrivate ? privateHelpId : undefined}
                      className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      <Send className="rtl:-scale-x-100" size={16} aria-hidden />
                      {busy ? t('common.applying') : t('jobs.apply')}
                    </button>
                  </span>
                  {!profilePrivate && message.trim().length < MSG_MIN ? (
                    <span className="ms-3 text-xs text-ink-soft" role="status">
                      {message.trim().length === 0
                        ? t('jobs.introRequired')
                        : t('jobs.introTooShort', { minimum: MSG_MIN })}
                    </span>
                  ) : null}
                </form>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
