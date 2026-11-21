import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Ban, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import {
  ApiError,
  api,
  canManageJobs,
  type Job,
  type JobApplication,
  type JobStatus,
} from '../../api'
import { formatInt } from '../../lib/status'
import { PersonDialog } from '../PersonDialog'
import { ReportButton } from '../reports/ReportButton'
import { Chip } from '../market/Chip'
import {
  applicantsCount,
  applicationStatusMeta,
  hiredLine,
  jobDates,
  jobStatusMeta,
  jobToBody,
  kindChip,
  kindChipClass,
} from './format'

type MyPostsTabProps = {
  farmId: number | null
  role: string
  jobs: Job[]
  loading: boolean
  loadErr: string
  highlightId: number | null
  onRetry: () => void
  onJobsChange: (next: Job[] | ((prev: Job[]) => Job[])) => void
  onRefresh: () => void
  onPostJob?: () => void
  onEdit: (job: Job) => void
}

export function MyPostsTab({
  farmId,
  role,
  jobs,
  loading,
  loadErr,
  highlightId,
  onRetry,
  onJobsChange,
  onRefresh,
  onPostJob,
  onEdit,
}: MyPostsTabProps) {
  const canManage = canManageJobs(role)
  const filterId = useId()
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [rowErr, setRowErr] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [apps, setApps] = useState<JobApplication[]>([])
  const [appReady, setAppReady] = useState(!canManage)
  const [appErr, setAppErr] = useState('')
  const [appTick, setAppTick] = useState(0)
  const [jobFilter, setJobFilter] = useState('')
  const [profileId, setProfileId] = useState<number | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    setConfirmId(null)
    setRowErr('')
    setBusyId(null)
    setApps([])
    setAppReady(!canManage)
    setAppErr('')
    setJobFilter('')
    setProfileId(null)
  }, [farmId, canManage])

  useEffect(() => {
    if (!canManage || farmId == null) return
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setAppReady(false)

    api
      .farmJobApplications(farmId)
      .then((rows) => {
        if (cancelled || my !== seqRef.current) return
        setApps(rows)
        setAppErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setAppErr(e instanceof ApiError ? e.message : t('jobs.applicationLoadError'))
      })
      .finally(() => {
        if (!cancelled && my === seqRef.current) setAppReady(true)
      })

    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [farmId, canManage, appTick])

  async function toggleStatus(job: Job) {
    if (farmId == null) return
    const next: JobStatus = job.status === 'closed' ? 'open' : 'closed'
    setBusyId(job.id)
    setRowErr('')
    try {
      const saved = await api.updateFarmJob(farmId, job.id, {
        ...jobToBody(job),
        status: next,
      })
      onJobsChange((list) => list.map((j) => (j.id === saved.id ? saved : j)))
    } catch (error) {
      setRowErr(error instanceof ApiError ? error.message : t('jobs.updateError'))
    } finally {
      setBusyId(null)
    }
  }

  async function onRemove(job: Job) {
    if (farmId == null) return
    setRowErr('')
    try {
      await api.deleteFarmJob(farmId, job.id)
      onJobsChange((list) => list.filter((j) => j.id !== job.id))
      setApps((list) => list.filter((a) => a.job_id !== job.id))
      setConfirmId(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onJobsChange((list) => list.filter((j) => j.id !== job.id))
        setApps((list) => list.filter((a) => a.job_id !== job.id))
        setConfirmId(null)
        return
      }
      setRowErr(error instanceof ApiError ? error.message : t('jobs.deleteError'))
    }
  }

  async function patchApplication(
    application: JobApplication,
    status: 'accepted' | 'declined',
  ) {
    setRowErr('')
    const wasPending = application.status === 'pending'
    try {
      const saved = await api.updateJobApplication(application.id, status)
      setApps((list) => list.map((a) => (a.id === saved.id ? saved : a)))
      if (wasPending && status === 'accepted') {
        onJobsChange((list) =>
          list.map((j) => {
            if (j.id !== saved.job_id) return j
            const accepted = j.accepted_count + 1
            const pending = j.pending_applications == null ? undefined : Math.max(0, j.pending_applications - 1)
            const nextStatus: JobStatus =
              j.status === 'open' && accepted >= j.workers_needed ? 'filled' : j.status
            return {
              ...j,
              accepted_count: accepted,
              pending_applications: pending,
              status: nextStatus,
            }
          }),
        )
      } else if (wasPending) {
        onJobsChange((list) =>
          list.map((j) =>
            j.id === saved.job_id
              ? {
                  ...j,
                  pending_applications: j.pending_applications == null ? undefined : Math.max(0, j.pending_applications - 1),
                }
              : j,
          ),
        )
      }
      onRefresh()
    } catch (error) {
      setRowErr(error instanceof ApiError ? error.message : t('jobs.applicationUpdateError'))
    }
  }

  const shownApps = useMemo(() => {
    if (!jobFilter) return apps
    const id = Number(jobFilter)
    return apps.filter((a) => a.job_id === id)
  }, [apps, jobFilter])

  const groups = useMemo(() => {
    const order: number[] = []
    const map = new Map<number, JobApplication[]>()
    for (const a of shownApps) {
      const list = map.get(a.job_id)
      if (!list) {
        map.set(a.job_id, [a])
        order.push(a.job_id)
      } else {
        list.push(a)
      }
    }
    return order.map((id) => {
      const items = map.get(id) ?? []
      const first = items[0]
      return { jobId: id, title: first?.job_title ?? t('cv.experience.job'), items }
    })
  }, [shownApps])

  if (loadErr && jobs.length === 0) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
      >
        <p>{loadErr}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <ul className="space-y-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-card border border-line bg-white p-3">
            <div className="aqua-skel h-4 w-2/3 rounded" />
            <div className="aqua-skel mt-2 h-3 w-1/2 rounded" />
          </li>
        ))}
      </ul>
    )
  }

  if (jobs.length === 0) {
    return (
      <EmptyState text={t('jobs.noPosts')} action={canManage && onPostJob
        ? { label: t('jobs.post'), onClick: onPostJob }
        : { label: t('jobs.post'), disabledReason: t('jobs.postForbidden') }} />
    )
  }

  return (
    <div className="grid h-full min-h-0 gap-6 xl:grid-cols-2">
      <div className="flex min-h-0 min-w-0 flex-col">
        <h3 className="shrink-0 font-serif text-base text-ink">{t('jobs.yourPosts')}</h3>
        {rowErr ? (
          <p className="mt-2 shrink-0 text-sm text-hanko" role="alert">
            {rowErr}
          </p>
        ) : null}
        <ul className="page-scroll mt-3 min-h-0 flex-1 space-y-3">
          {jobs.map((j) => (
            <PostRow
              key={j.id}
              job={j}
              canManage={canManage}
              confirm={confirmId === j.id}
              highlight={highlightId === j.id}
              busy={busyId === j.id}
              onEdit={() => onEdit(j)}
              onToggle={() => void toggleStatus(j)}
              onAskRemove={() => {
                setConfirmId(j.id)
                setRowErr('')
              }}
              onCancelRemove={() => {
                setConfirmId(null)
                setRowErr('')
              }}
              onRemove={() => void onRemove(j)}
            />
          ))}
        </ul>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <h3 className="shrink-0 font-serif text-base text-ink">{t('jobs.applicants')}</h3>
        {canManage ? (
          appErr && apps.length === 0 && appReady ? (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
            >
              <p>{appErr}</p>
              <button
                type="button"
                onClick={() => {
                  setAppErr('')
                  setAppTick((n) => n + 1)
                }}
                className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : !appReady ? (
            <ul className="mt-3 space-y-2" aria-hidden>
              {[0, 1].map((i) => (
                <li key={i} className="rounded-card border border-line bg-white p-3">
                  <div className="aqua-skel h-4 w-1/2 rounded" />
                  <div className="aqua-skel mt-2 h-3 w-full rounded" />
                </li>
              ))}
            </ul>
          ) : apps.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">{t('jobs.applicantsEmpty')}</p>
          ) : (
            <>
              <div className="mt-3 min-w-0 shrink-0">
                <label htmlFor={filterId} className="text-xs font-medium text-ink-soft">
                  {t('cv.experience.job')}
                </label>
                <select
                  id={filterId}
                  value={jobFilter}
                  onChange={(e) => setJobFilter(e.target.value)}
                  className="mt-1 w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                >
                  <option value="">{t('jobs.allJobs')}</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={String(j.id)}>
                      {j.title}
                    </option>
                  ))}
                </select>
              </div>
              {groups.length === 0 ? (
                <p className="text-sm text-ink-soft">{t('jobs.jobApplicationsEmpty')}</p>
              ) : (
                <div className="page-scroll mt-3 min-h-0 flex-1 space-y-4">
                  {groups.map((g) => (
                    <div key={g.jobId} className="min-w-0 space-y-2">
                      {jobFilter ? null : (
                        <h4 className="truncate text-xs font-medium text-ink-soft">{g.title}</h4>
                      )}
                      <ul className="space-y-2">
                        {g.items.map((app) => (
                          <ApplicantRow
                            key={app.id}
                            application={app}
                            onAccept={() => void patchApplication(app, 'accepted')}
                            onDecline={() => void patchApplication(app, 'declined')}
                            onViewProfile={
                              app.applicant
                                ? () => {
                                    const id = app.applicant?.id
                                    if (id != null) setProfileId(id)
                                  }
                                : undefined
                            }
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            {t('jobs.reviewPermission')}
          </p>
        )}
      </div>
      <PersonDialog
        open={profileId != null}
        userId={profileId}
        onClose={() => setProfileId(null)}
      />
    </div>
  )
}

function PostRow({
  job,
  canManage,
  confirm,
  highlight,
  busy,
  onEdit,
  onToggle,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  job: Job
  canManage: boolean
  confirm: boolean
  highlight: boolean
  busy: boolean
  onEdit: () => void
  onToggle: () => void
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
}) {
  const status = jobStatusMeta(job.status)
  const dates = jobDates(job.kind, job.start_date, job.end_date)
  const closed = job.status === 'closed'
  const pending = job.pending_applications ?? 0
  const count = job.application_count

  return (
    <li
      data-card=""
      className={`min-w-0 rounded-card border border-line p-3 ${
        highlight ? 'bg-leaf-soft/40 ring-2 ring-leaf' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <p className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-ink">
          {job.title}
        </p>
        <Chip className={status.className}>{status.label}</Chip>
        
      </div>
      <EnteredBy record={job} />
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip className={kindChipClass(job.kind)}>{kindChip(job.kind)}</Chip>
        {dates ? <Chip>{dates}</Chip> : null}
        <Chip>{count == null ? t('common.countMissing') : applicantsCount(count)}</Chip>
        {pending > 0 ? (
          <Chip className="bg-hanko text-white">
            {pending > 99 ? '99+' : formatInt(pending)} pending
          </Chip>
        ) : null}
        <Chip>{hiredLine(job.accepted_count, job.workers_needed)}</Chip>
      </div>
      {canManage && confirm ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <p className="text-ink">{t('jobs.deleteConfirm')}</p>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
          >
            {t('common.yes')}
          </button>
          <button
            type="button"
            onClick={onCancelRemove}
            className="rounded-full border border-line px-3 py-1 text-xs"
          >
            {t('common.no')}
          </button>
        </div>
      ) : canManage ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
          >
            <Pencil size={14} aria-hidden />
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={onToggle}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
          >
            {closed ? <RotateCcw size={14} aria-hidden /> : <Ban size={14} aria-hidden />}
            {closed ? t('reports.reopen') : t('common.close')}
          </button>
          <button
            type="button"
            onClick={onAskRemove}
            aria-label={t('common.deleteNamed', { name: job.title })}
            className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:text-hanko"
          >
            <Trash2 size={14} aria-hidden />
            {t('common.delete')}
          </button>
        </div>
      ) : null}
    </li>
  )
}

function ApplicantRow({
  application,
  onAccept,
  onDecline,
  onViewProfile,
}: {
  application: JobApplication
  onAccept: () => void
  onDecline: () => void
  onViewProfile?: () => void
}) {
  const chip = applicationStatusMeta(application.status)
  const applicant = application.applicant
  const pending = application.status === 'pending'
  const accepted = application.status === 'accepted'

  return (
    <li
      className={`min-w-0 rounded-card border border-line p-3 ${
        accepted ? 'bg-leaf-soft/40' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {applicant ? (
            <>
              <p className="truncate font-medium text-ink">{applicant.name}</p>
              <a
                href={`mailto:${applicant.email}`}
                className="truncate text-xs text-forest underline-offset-2 hover:underline"
              >
                {applicant.email}
              </a>
            </>
          ) : (
            <p className="text-sm text-ink-soft">{t('jobs.applicant')}</p>
          )}
        </div>
        <Chip className={chip.className}>{chip.label}</Chip>
      </div>
      <p className="mt-1 truncate text-xs text-ink-soft">{application.job_title}</p>
      <p className="mt-1 text-sm break-words text-ink">{application.message}</p>
      <EnteredBy record={application} />
      {onViewProfile || pending || applicant ? (
      <div className="mt-2 flex flex-wrap gap-2">
        {onViewProfile ? (
          <button
            type="button"
            onClick={onViewProfile}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink"
          >
            {t('common.viewProfile')}
          </button>
        ) : null}
        {applicant ? (
          <ReportButton targetUserId={applicant.id} targetName={applicant.name} />
        ) : null}
        {pending ? (
          <>
            <button
              type="button"
              onClick={onAccept}
              className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
            >
              {t('common.accept')}
            </button>
            <button
              type="button"
              onClick={onDecline}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink"
            >
              {t('common.decline')}
            </button>
          </>
        ) : null}
      </div>
      ) : null}
    </li>
  )
}
