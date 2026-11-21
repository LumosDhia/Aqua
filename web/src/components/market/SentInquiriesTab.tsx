import { t } from '../../i18n'
import { VIEW_HREF } from '../../lib/view'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api, type MarketInquiry } from '../../api'
import { Chip } from './Chip'
import { inquiryStatusMeta } from './format'

export function SentInquiriesTab({ tick }: { tick: number }) {
  const [items, setItems] = useState<MarketInquiry[]>([])
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
      .myMarketInquiries()
      .then((rows) => {
        if (cancelled || my !== seqRef.current) return
        setItems(rows)
        setLoadErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setLoadErr(e instanceof ApiError ? e.message : t('market.inquiriesError'))
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
    return <EmptyState text={t('market.noSent')} action={{ label: t('market.browseLink'), href: VIEW_HREF.market }} />
  }

  return (
    <ul className="page-scroll h-full min-h-0 space-y-2">
      {items.map((inq) => {
        const chip = inquiryStatusMeta(inq.status, true)
        return (
          <li key={inq.id} className="min-w-0 rounded-card border border-line bg-white p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-serif text-lg leading-tight text-ink">
                  {inq.listing_title}
                </p>
                {inq.farm_name ? (
                  <p className="truncate text-xs text-ink-soft">{inq.farm_name}</p>
                ) : null}
              </div>
              <Chip className={chip.className}>{chip.label}</Chip>
            </div>
            <p className="mt-2 text-sm break-words text-ink">{inq.message}</p>
            <EnteredBy record={inq} />
          </li>
        )
      })}
    </ul>
  )
}
