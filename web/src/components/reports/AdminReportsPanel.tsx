import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useState } from 'react'
import { Ban, ShieldCheck } from 'lucide-react'
import { ApiError, api, type AdminReport, type AdminReportPatch, type ReportStatus } from '../../api'
import { formatInt } from '../../lib/status'
import { PageFrame } from '../PageFrame'
import { REPORT_STATUS_FILTERS, reportReasonLabel, reportStatusMeta, reportsAgainstLabel } from './format'

type Filter = 'all' | ReportStatus

const NOTE_MAX = 1000

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError || error instanceof Error ? error.message : fallback
}

export function AdminReportsPanel({ allowed }: { allowed: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [revision, setRevision] = useState(0)
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!allowed) return
    let active = true
    setReports(null)
    setError('')
    api
      .adminReports(filter === 'all' ? undefined : filter)
      .then((rows) => {
        if (active) setReports(rows)
      })
      .catch((e) => {
        if (active) setError(apiMessage(e, t('reports.loadError')))
      })
    return () => {
      active = false
    }
  }, [allowed, filter, revision])

  function updateReport(saved: AdminReport) {
    setReports(
      (rows) =>
        rows
          ?.map((row) => {
            if (row.id === saved.id) return saved
            // suspending or lifting applies to the person, so every report about them follows
            if (row.target.id === saved.target.id) return { ...row, target: saved.target }
            return row
          })
          .filter((row) => filter === 'all' || row.status === filter) ?? null,
    )
  }

  const count = reports?.length ?? 0

  return (
    <PageFrame
      demonstration={reports?.some((report) => report.demo)}
      label={t('reports.title')}
      busy={!reports && !error && allowed}
      header={
        <header className="border-b border-line px-4 py-3 sm:px-6">
          <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
            {t('reports.title')}
          </h2>
          <p className="text-xs text-ink-soft">
            {!allowed ? t('reports.onlyAdmin') : reports ? `${formatInt(count)} ${count === 1 ? 'report' : 'reports'}` : t('common.loadingPlain')}
          </p>
          {allowed ? (
            <div
              role="group"
              aria-label={t('reports.filter')}
              className="mt-3 inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
            >
              {REPORT_STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full px-3 py-1.5 sm:px-4 ${
                    filter === f.id ? 'bg-white text-ink shadow-sm' : 'text-ink-soft'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          ) : null}
        </header>
      }
    >
      {!allowed ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-soft text-forest" aria-hidden>
            <ShieldCheck size={28} />
          </div>
          <p className="mt-4 font-serif text-xl text-ink">{t('reports.forbidden')}</p>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">{t('reports.adminPermission')}</p>
        </div>
      ) : error ? (
        <p role="alert" className="rounded-card border border-hanko/30 bg-hanko/5 px-3 py-2 text-sm text-hanko">
          {error}
        </p>
      ) : !reports ? (
        <ul className="grid grid-cols-1 gap-3" aria-hidden>
          {[0, 1].map((i) => (
            <li key={i} className="aqua-skel h-44 rounded-card" />
          ))}
        </ul>
      ) : reports.length === 0 ? (
        <EmptyState text={filter === 'all' ? t('reports.none') : t('reports.noneMatch')} action={filter === 'all' ? { label: t('reports.refresh'), onClick: () => setRevision((value) => value + 1) } : { label: t('reports.all'), onClick: () => setFilter('all') }} />
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {reports.map((report) => (
            <ReportReview key={report.id} report={report} onSaved={updateReport} />
          ))}
        </ul>
      )}
    </PageFrame>
  )
}

function ReportReview({ report, onSaved }: { report: AdminReport; onSaved: (report: AdminReport) => void }) {
  const noteId = useId()
  const [note, setNote] = useState(report.admin_note)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const status = reportStatusMeta(report.status)
  const suspended = !report.target.active

  async function save(patch: AdminReportPatch, done: string) {
    setBusy(true)
    setMessage(null)
    try {
      onSaved(await api.patchAdminReport(report.id, patch))
      setMessage({ ok: true, text: done })
      setConfirming(false)
    } catch (e) {
      setMessage({ ok: false, text: apiMessage(e, t('reports.saveError')) })
    } finally {
      setBusy(false)
    }
  }

  const setStatus = (next: ReportStatus, done: string) => save({ status: next, admin_note: note.trim() }, done)
  const action =
    'rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <li data-card="" className="rounded-card border border-line bg-cream p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-serif text-lg leading-tight text-ink">{report.target.name}</p>
          <p className="text-xs text-ink-soft">{report.target.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-cream-deep px-2 py-0.5 text-xs text-ink">
            {reportsAgainstLabel(report.target.reports_against)}
          </span>
          {suspended ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-hanko/10 px-2 py-0.5 text-xs text-hanko">
              <Ban size={12} aria-hidden /> {' '}{t('reports.suspended')}
            </span>
          ) : null}
          <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-ink">
        {t('reports.reporter')}{' '} {report.reporter.name} <span className="text-ink-soft">· {report.reporter.email}</span>
      </p>
      <p className="mt-1 text-sm font-medium text-ink">{reportReasonLabel(report.reason)}</p>
      <p className="text-xs text-ink-soft">
        <EnteredBy record={report} />
        {report.engagement_id != null ? t('reports.workId', { id: report.engagement_id }) : ''}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">{report.details}</p>

      <label htmlFor={noteId} className="mt-3 block text-xs font-medium text-ink-soft">
        {t('reports.adminNote')}
      </label>
      <textarea
        id={noteId}
        value={note}
        maxLength={NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="mt-1 block w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
      />
      <p className="mt-0.5 text-end text-[11px] text-ink-soft">
        {formatInt(note.length)}/{formatInt(NOTE_MAX)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || report.status === 'reviewing'} onClick={() => void setStatus('reviewing', t('reports.reviewedToast'))} className={action}>
          {t('reports.reviewing')}
        </button>
        <button type="button" disabled={busy || report.status === 'resolved'} onClick={() => void setStatus('resolved', t('reports.resolvedToast'))} className={action}>
          {t('reports.resolve')}
        </button>
        <button type="button" disabled={busy || report.status === 'dismissed'} onClick={() => void setStatus('dismissed', t('reports.dismissedToast'))} className={action}>
          {t('common.dismiss')}
        </button>
        <button type="button" disabled={busy || report.status === 'open'} onClick={() => void setStatus('open', t('reports.reopenedToast'))} className={action}>
          {t('reports.reopen')}
        </button>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        {confirming ? (
          <div role="alertdialog" aria-label={t('reports.suspendNamed', { name: report.target.name })} className="rounded-xl border border-hanko/30 bg-hanko/5 p-3">
            <p className="text-sm text-ink">
              {t('reports.suspend')}{' '} {report.target.name}{t('reports.suspendConfirm')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save({ suspend: true }, t('reports.suspendedToast'))}
                className="rounded-full bg-hanko px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {t('reports.suspendAccount')}
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={action}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : suspended ? (
          <button type="button" disabled={busy} onClick={() => void save({ suspend: false }, t('reports.liftedToast'))} className={action}>
            {t('reports.lift')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-hanko/40 px-3 py-1.5 text-xs font-medium text-hanko disabled:opacity-50"
          >
            <Ban size={14} aria-hidden /> {' '}{t('reports.suspendAccount')}
          </button>
        )}
      </div>

      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${message.ok ? 'text-forest' : 'text-hanko'}`}>
          {message.text}
        </p>
      ) : null}
    </li>
  )
}
