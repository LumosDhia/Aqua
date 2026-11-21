import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useState } from 'react'
import { api, type Report } from '../../api'
import { reportReasonLabel, reportStatusMeta, reportWhen } from './format'

export function MyReportsCard() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.myReports().then(rows => { if (active) setReports(rows) }).catch(error => {
      if (active) setError(error instanceof Error ? error.message : t('reports.ownError'))
    })
    return () => { active = false }
  }, [])

  return (
    <section data-card="" aria-label={t('reports.own')} className="rounded-card border border-line bg-cream p-4">
      <h2 className="font-serif text-lg text-ink">{t('reports.own')}</h2>
      {error ? <p role="alert" className="mt-2 text-sm text-hanko">{error}</p> : !reports ? <p className="mt-2 text-sm text-ink-soft">{t('reports.loading')}</p> : reports.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">{t('reports.ownEmpty')}</p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {reports.map(report => {
            const status = reportStatusMeta(report.status)
            return (
              <li key={report.id} className="space-y-1 py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {report.target.name} · {reportReasonLabel(report.reason)}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                </p>
                <p className="whitespace-pre-wrap break-words">{report.details}</p>
                <EnteredBy record={report} />
                {report.resolved_at ? <p className="text-ink-soft">{t('common.closed')}{' '} {reportWhen(report.resolved_at)}</p> : null}
                {report.admin_note && <p className="whitespace-pre-wrap text-ink">{t('reports.noteCaption')}{' '} {report.admin_note}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
