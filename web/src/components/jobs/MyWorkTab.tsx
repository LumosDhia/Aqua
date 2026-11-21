import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useRef, useState } from 'react'
import { Handshake } from 'lucide-react'
import { ApiError, api, type Engagement } from '../../api'
import { messagesHref } from '../../lib/view'
import { Chip } from '../market/Chip'
import {
  engagementDates,
  engagementKindClass,
  engagementKindLabel,
  engagementStatusMeta,
  sortMine,
} from '../workers/engagement'

type MyWorkTabProps = {
  tick?: number
  onGoOpportunities: () => void
}

export function MyWorkTab({ tick = 0, onGoOpportunities }: MyWorkTabProps) {
  const [items, setItems] = useState<Engagement[]>([])
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const seqRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)

    api
      .myEngagements()
      .then((rows) => {
        if (cancelled || my !== seqRef.current) return
        setItems(sortMine(rows))
        setLoadErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setLoadErr(e instanceof ApiError ? e.message : t('jobs.workLoadError'))
      })
      .finally(() => {
        if (!cancelled && my === seqRef.current) setReady(true)
      })

    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [tick, retryTick])

  if (loadErr && items.length === 0 && ready) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
      >
        <p>{loadErr}</p>
        <button
          type="button"
          onClick={() => {
            setLoadErr('')
            setRetryTick((n) => n + 1)
          }}
          className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  if (!ready) {
    return (
      <ul className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-card border border-line bg-white p-3">
            <div className="aqua-skel h-4 w-1/2 rounded" />
            <div className="aqua-skel mt-2 h-3 w-full rounded" />
            <div className="aqua-skel mt-2 h-3 w-1/3 rounded" />
          </li>
        ))}
      </ul>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-soft text-forest"
          aria-hidden
        >
          <Handshake size={28} />
        </div>
        <p className="mt-4 font-serif text-xl text-ink">{t('jobs.noWork')}</p>
        <button
          type="button"
          onClick={onGoOpportunities}
          className="mt-4 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
        >
          {t('jobs.opportunities')}
        </button>
      </div>
    )
  }

  return (
    <ul className="page-scroll h-full min-h-0 space-y-2">
      {items.map((eng) => {
        const status = engagementStatusMeta(eng.status)
        const dates = engagementDates(eng.start_date, eng.end_date)
        const note = eng.note.trim()
        const reason = (eng.reason ?? '').trim()
        const place = [eng.farm.name, eng.farm.region].filter(Boolean).join(' · ')
        return (
          <li key={eng.id} data-card="" className="min-w-0 rounded-card border border-line bg-white p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-serif text-lg leading-tight text-ink">{eng.title}</p>
                <EnteredBy record={eng.farm} />
                <EnteredBy record={eng} />
                <p className="truncate text-xs text-ink-soft">{place}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Chip className={engagementKindClass(eng.kind)}>
                  {engagementKindLabel(eng.kind)}
                </Chip>
                <Chip className={status.className}>{status.label}</Chip>
              </div>
            </div>
            {dates ? <p className="mt-2 text-xs text-ink-soft">{dates}</p> : null}
            {eng.status === 'finished' && note ? (
              <p className="mt-2 text-sm break-words text-ink">{t('jobs.fromFarm')}{' '} {note}</p>
            ) : null}
            {eng.status === 'disapproved' && reason ? (
              <p className="mt-2 text-sm break-words text-ink">
                {t('jobs.ended')}{' '} {reason}
              </p>
            ) : null}
            <div className="mt-3">
              <a
                href={messagesHref(eng.id)}
                className="inline-flex rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
              >
                {t('worker.messageFarm')}
              </a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
