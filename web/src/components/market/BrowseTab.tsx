import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { FarmNotice } from '../FarmNotice'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { ApiError, api, type MarketMeta, type MarketListing, type MarketSort } from '../../api'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import { ListingCard, ListingCardSkeleton } from './ListingCard'
import { MARKET_SOURCES, isMarketSource, listingsCount } from './format'

type FulfilmentFilter = '' | 'pickup' | 'delivery'

type BrowseTabProps = {
  farmId: number | null
  meta: MarketMeta | null
  tick: number
  canList: boolean
  onOpen: (id: number) => void
  onListWater?: () => void
}

const PAGE = 24

export function BrowseTab({
  farmId,
  meta,
  tick,
  canList,
  onOpen,
  onListWater,
}: BrowseTabProps) {
  const searchId = useId()
  const govId = useId()
  const fulfilId = useId()
  const sourceId = useId()
  const priceId = useId()
  const volId = useId()
  const sortId = useId()

  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [governorate, setGovernorate] = useState('')
  const [fulfilment, setFulfilment] = useState<FulfilmentFilter>('')
  const [source, setSource] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxPriceDeb, setMaxPriceDeb] = useState('')
  const [minVolume, setMinVolume] = useState('')
  const [minVolumeDeb, setMinVolumeDeb] = useState('')
  const [sort, setSort] = useState<MarketSort>('newest')

  const [items, setItems] = useState<MarketListing[]>([])
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

  useEffect(() => {
    if (maxPrice === maxPriceDeb) return
    const t = window.setTimeout(() => setMaxPriceDeb(maxPrice), 300)
    return () => window.clearTimeout(t)
  }, [maxPrice, maxPriceDeb])

  useEffect(() => {
    if (minVolume === minVolumeDeb) return
    const t = window.setTimeout(() => setMinVolumeDeb(minVolume), 300)
    return () => window.clearTimeout(t)
  }, [minVolume, minVolumeDeb])

  const restrictive =
    qDeb.trim() !== '' ||
    governorate !== '' ||
    fulfilment !== '' ||
    source !== '' ||
    maxPriceDeb.trim() !== '' ||
    minVolumeDeb.trim() !== ''

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')
    setItems([])
    setTotal(0)

    async function load() {
      const maxN = Number(maxPriceDeb.trim())
      const minM3 = Number(minVolumeDeb.trim())
      try {
        const page = await api.marketListings({
          q: qDeb.trim() || undefined,
          governorate: governorate || undefined,
          fulfilment: fulfilment || undefined,
          source: source || undefined,
          max_price: maxPriceDeb.trim() !== '' && Number.isFinite(maxN) ? maxN : undefined,
          min_litres:
            minVolumeDeb.trim() !== '' && Number.isFinite(minM3)
              ? Math.round(minM3 * 1000)
              : undefined,
          sort,
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
        setLoadErr(e instanceof ApiError ? e.message : t('market.loadError'))
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
  }, [
    qDeb,
    governorate,
    fulfilment,
    source,
    maxPriceDeb,
    minVolumeDeb,
    sort,
    farmId,
    tick,
    retryTick,
  ])

  async function loadMore() {
    if (moreBusy || itemsRef.current.length >= total) return
    setMoreBusy(true)
    const maxN = Number(maxPriceDeb.trim())
    const minM3 = Number(minVolumeDeb.trim())
    const my = seqRef.current
    try {
      const page = await api.marketListings({
        q: qDeb.trim() || undefined,
        governorate: governorate || undefined,
        fulfilment: fulfilment || undefined,
        source: source || undefined,
        max_price: maxPriceDeb.trim() !== '' && Number.isFinite(maxN) ? maxN : undefined,
        min_litres:
          minVolumeDeb.trim() !== '' && Number.isFinite(minM3)
            ? Math.round(minM3 * 1000)
            : undefined,
        sort,
        near_farm_id: farmId ?? undefined,
        limit: PAGE,
        offset: itemsRef.current.length,
      })
      if (my !== seqRef.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((l) => l.id))
        return [...prev, ...page.items.filter((l) => !seen.has(l.id))]
      })
      setTotal(page.total)
      setLoadErr('')
    } catch (e) {
      if (my !== seqRef.current) return
      setLoadErr(e instanceof ApiError ? e.message : t('market.loadError'))
    } finally {
      setMoreBusy(false)
    }
  }

  function clearFilters() {
    setQ('')
    setQDeb('')
    setGovernorate('')
    setFulfilment('')
    setSource('')
    setMaxPrice('')
    setMaxPriceDeb('')
    setMinVolume('')
    setMinVolumeDeb('')
    setSort('newest')
  }

  const anyFilter =
    restrictive || sort !== 'newest'
  const showEmpty = ready && !loadErr && items.length === 0
  const marketplaceEmpty = showEmpty && !restrictive

  const fieldClass =
    'w-full min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm text-ink'

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {farmId == null && items.some((item) => item.farm.demo) ? <FarmNotice /> : null}
      <div className="shrink-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[10rem] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <label htmlFor={searchId} className="sr-only">
              {t('market.search')}
            </label>
            <input
              id={searchId}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('market.search')}
              autoComplete="off"
              className="w-full rounded-full bg-cream py-1.5 pe-3 ps-8 text-sm text-ink placeholder:text-ink-soft"
            />
          </div>
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
          <FilterField label={t('market.collection')} htmlFor={fulfilId}>
            <select
              id={fulfilId}
              value={fulfilment}
              onChange={(e) => setFulfilment(e.target.value as FulfilmentFilter)}
              className={fieldClass}
            >
              <option value="">{t('common.any')}</option>
              <option value="pickup">{t('market.pickupPossible')}</option>
              <option value="delivery">{t('market.deliveryPossible')}</option>
            </select>
          </FilterField>
          <FilterField label={t('market.source')} htmlFor={sourceId}>
            <div className="flex w-full min-w-0 items-center gap-1.5">
              {isMarketSource(source) ? (
                <WaterSourceIcon kind={source} size={16} className="shrink-0 text-forest" />
              ) : null}
              <select
                id={sourceId}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={`${fieldClass} flex-1`}
              >
                <option value="">{t('market.allSources')}</option>
                {MARKET_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </FilterField>
          <FilterField label={t('market.maxPrice')} htmlFor={priceId}>
            <input
              id={priceId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder={t('market.maxPriceShort')}
              className={`${fieldClass} w-[8.5rem]`}
            />
          </FilterField>
          <FilterField label={t('market.minimum')} htmlFor={volId}>
            <input
              id={volId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={minVolume}
              onChange={(e) => setMinVolume(e.target.value)}
              placeholder={t('market.minimumShort')}
              className={`${fieldClass} w-[8.5rem]`}
            />
          </FilterField>
          <FilterField label={t('common.sort')} htmlFor={sortId}>
            <select
              id={sortId}
              value={sort}
              onChange={(e) => setSort(e.target.value as MarketSort)}
              className={fieldClass}
            >
              <option value="newest">{t('common.newest')}</option>
              <option value="distance">{t('jobs.nearestFarm')}</option>
              <option value="price">{t('market.cheapest')}</option>
              <option value="volume">{t('market.largest')}</option>
            </select>
          </FilterField>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-soft" aria-live="polite">
            {ready && !loadErr ? listingsCount(total) : '\u00a0'}
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
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </ul>
      ) : loadErr && items.length === 0 ? null : showEmpty ? (
        <EmptyState
          text={marketplaceEmpty ? t('market.empty') : t('market.noMatch')}
          action={!marketplaceEmpty
            ? { label: t('common.clearFilters'), onClick: clearFilters }
            : canList && onListWater
              ? { label: t('market.list'), onClick: onListWater }
              : { label: t('market.list'), disabledReason: farmId == null ? t('common.selectFarm') : t('market.noListingPermission') }}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {items.map((l) => (
              <ListingCard key={l.id} listing={l} onOpen={() => onOpen(l.id)} />
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
