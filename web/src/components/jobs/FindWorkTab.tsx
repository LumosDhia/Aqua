import { t } from '../../i18n'
import { VIEW_HREF } from '../../lib/view'
import { EmptyState } from '../EmptyState'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import {
  ApiError,
  api,
  type Job,
  type JobKind,
  type JobSort,
  type MarketMeta,
} from '../../api'
import { JobCard, JobCardSkeleton } from './JobCard'
import { JOB_KINDS, isJobKind, jobsCount } from './format'

type KindFilter = '' | JobKind

type FindWorkTabProps = {
  farmId: number | null
  meta: MarketMeta | null
  tick: number
  canPost: boolean
  workerMode?: boolean
  onOpen: (id: number) => void
  onPostJob?: () => void
}

const PAGE = 24

export function FindWorkTab({
  farmId,
  meta,
  tick,
  canPost,
  workerMode = false,
  onOpen,
  onPostJob,
}: FindWorkTabProps) {
  const searchId = useId()
  const kindId = useId()
  const govId = useId()
  const sortId = useId()

  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [kind, setKind] = useState<KindFilter>('')
  const [governorate, setGovernorate] = useState('')
  const [sort, setSort] = useState<JobSort>('newest')

  const [items, setItems] = useState<Job[]>([])
  const [total, setTotal] = useState(0)
  const [ready, setReady] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const seqRef = useRef(0)

  useEffect(() => {
    if (q === qDeb) return
    const t = window.setTimeout(() => setQDeb(q), 300)
    return () => window.clearTimeout(t)
  }, [q, qDeb])

  const restrictive = qDeb.trim() !== '' || kind !== '' || governorate !== ''

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')
    setItems([])
    setTotal(0)

    async function load() {
      try {
        const page = await api.jobs({
          q: qDeb.trim() || undefined,
          kind: kind || undefined,
          governorate: governorate || undefined,
          sort: farmId == null && sort === 'distance' ? 'newest' : sort,
          near_farm_id: farmId ?? undefined,
          limit: PAGE,
          offset: 0,
        })
        if (cancelled || my !== seqRef.current) return
        setItems(page.items)
        setTotal(page.total)
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        setLoadErr(e instanceof ApiError ? e.message : t('jobs.loadError'))
        setItems([])
        setTotal(0)
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load()
    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [qDeb, kind, governorate, sort, farmId, tick, retryTick])

  async function loadMore() {
    if (moreBusy || itemsRef.current.length >= total) return
    setMoreBusy(true)
    const my = seqRef.current
    try {
      const page = await api.jobs({
        q: qDeb.trim() || undefined,
        kind: kind || undefined,
        governorate: governorate || undefined,
        sort: farmId == null && sort === 'distance' ? 'newest' : sort,
        near_farm_id: farmId ?? undefined,
        limit: PAGE,
        offset: itemsRef.current.length,
      })
      if (my !== seqRef.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((j) => j.id))
        return [...prev, ...page.items.filter((j) => !seen.has(j.id))]
      })
      setTotal(page.total)
      setLoadErr('')
    } catch (e) {
      if (my !== seqRef.current) return
      setLoadErr(e instanceof ApiError ? e.message : t('jobs.loadError'))
    } finally {
      setMoreBusy(false)
    }
  }

  function clearFilters() {
    setQ('')
    setQDeb('')
    setKind('')
    setGovernorate('')
    setSort('newest')
  }

  const sortValue = farmId == null && sort === 'distance' ? 'newest' : sort
  const anyFilter = restrictive || sortValue !== 'newest'
  const showEmpty = ready && !loadErr && items.length === 0
  const marketplaceEmpty = showEmpty && !restrictive

  const fieldClass =
    'w-full min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm text-ink'

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="shrink-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <label htmlFor={searchId} className="sr-only">
              {t('jobs.search')}
            </label>
            <input
              id={searchId}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('jobs.search')}
              autoComplete="off"
              className="w-full rounded-full bg-cream py-1.5 pe-3 ps-8 text-sm text-ink placeholder:text-ink-soft"
            />
          </div>
          <FilterField label={t('common.type')} htmlFor={kindId}>
            <select
              id={kindId}
              value={kind}
              onChange={(e) => {
                const next = e.target.value
                if (next === '' || isJobKind(next)) setKind(next)
              }}
              className={fieldClass}
            >
              <option value="">{t('common.all')}</option>
              {JOB_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t('common.governorate')} htmlFor={govId}>
            <select
              id={govId}
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              className={fieldClass}
            >
              <option value="">{t('common.allGovernorates')}</option>
              {(meta?.governorates ?? []).map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label={t('common.sort')} htmlFor={sortId}>
            <select
              id={sortId}
              value={sortValue}
              onChange={(e) => setSort(e.target.value as JobSort)}
              className={fieldClass}
            >
              <option value="newest">{t('common.newest')}</option>
              <option value="pay">{t('jobs.bestPaid')}</option>
              {farmId != null ? <option value="distance">{t('jobs.nearestFarm')}</option> : null}
            </select>
          </FilterField>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-soft" aria-live="polite">
            {ready && !loadErr ? jobsCount(total) : '\u00a0'}
          </p>
          {anyFilter ? (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-forest underline-offset-2 hover:underline"
            >
              {t('common.clearFilters')}
            </button>
          ) : null}
        </div>
      </div>

      {loadErr ? (
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
      ) : null}

      <div className="page-scroll min-h-0 flex-1">
      {!ready ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <JobCardSkeleton key={i} />
          ))}
        </ul>
      ) : loadErr && items.length === 0 ? null : showEmpty ? (
        <EmptyState
          text={marketplaceEmpty ? t('jobs.empty') : t('jobs.noFilterMatch')}
          action={!marketplaceEmpty
            ? { label: t('common.clearFilters'), onClick: clearFilters }
            : workerMode
              ? { label: t('jobs.updateProfile'), href: VIEW_HREF.profile }
              : canPost && onPostJob
                ? { label: t('jobs.post'), onClick: onPostJob }
                : { label: t('jobs.post'), disabledReason: farmId == null ? t('common.selectFarm') : t('jobs.postForbidden') }}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {items.map((j) => (
              <JobCard key={j.id} job={j} onOpen={() => onOpen(j.id)} />
            ))}
          </ul>
          {items.length < total ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={moreBusy}
                className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {moreBusy ? t('common.loading') : t('common.loadMore')}
              </button>
            </div>
          ) : null}
        </>
      )}
      </div>
    </div>
  )
}

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="min-w-[8.5rem] flex-1">
      <label htmlFor={htmlFor} className="sr-only">
        {label}
      </label>
      {children}
    </div>
  )
}
