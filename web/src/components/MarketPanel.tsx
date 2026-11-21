import { t, countLabel } from '../i18n'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import {
  ApiError,
  api,
  canManageMarket,
  type Farm,
  type MarketListing,
  type MarketMeta,
} from '../api'
import { formatInt } from '../lib/status'
import { clearMarketPrefill, peekMarketPrefill } from '../lib/view'
import { PageFrame } from './PageFrame'
import { BrowseTab } from './market/BrowseTab'
import { ListingDetailDialog } from './market/ListingDetailDialog'
import { ListingFormDialog } from './market/ListingFormDialog'
import { MyListingsTab } from './market/MyListingsTab'
import { SentInquiriesTab } from './market/SentInquiriesTab'

type MarketPanelProps = {
  farmId: number | null
  role: string
  farmLat: number | null
  farmLon: number | null
  farmRegion: string
}

type Tab = 'browse' | 'mine' | 'sent'

const TABS: Tab[] = ['browse', 'mine', 'sent']

export function MarketPanel({
  farmId,
  role,
  farmLat,
  farmLon,
  farmRegion,
}: MarketPanelProps) {
  const canManage = canManageMarket(role)
  const [farmDetails, setFarmDetails] = useState<Farm | null>(null)
  const [tab, setTab] = useState<Tab>('browse')
  const [meta, setMeta] = useState<MarketMeta | null>(null)
  const [mine, setMine] = useState<MarketListing[]>([])
  const [mineReady, setMineReady] = useState(false)
  const [mineErr, setMineErr] = useState('')
  const [mineTick, setMineTick] = useState(0)
  const [browseTick, setBrowseTick] = useState(0)
  const [sentTick, setSentTick] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [prefillLitres, setPrefillLitres] = useState<number | null>(null)
  const [editListing, setEditListing] = useState<MarketListing | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const seqRef = useRef(0)
  const browseTabRef = useRef<HTMLButtonElement>(null)
  const mineTabRef = useRef<HTMLButtonElement>(null)
  const sentTabRef = useRef<HTMLButtonElement>(null)

  const showAdd = canManage && farmId != null
  const activeFarm = farmDetails?.id === farmId ? farmDetails : null

  useEffect(() => {
    if (farmId == null) return
    let active = true
    void api.farm(farmId).then((farm) => {
      if (active) setFarmDetails(farm)
    }).catch(() => {
      if (active) setFarmDetails(null)
    })
    return () => { active = false }
  }, [farmId])

  useEffect(() => {
    setFormOpen(false)
    setPrefillLitres(null)
    setEditListing(null)
    setDetailId(null)
    setHighlightId(null)
    setTab('browse')
    setMine([])
    setMineReady(false)
    setMineErr('')
  }, [farmId])

  useEffect(() => {
    if (!canManage || farmId == null) return
    const litres = peekMarketPrefill()
    if (litres == null) return
    setPrefillLitres(litres)
    setEditListing(null)
    setFormOpen(true)
  }, [farmId, canManage])

  useEffect(() => {
    if (highlightId == null) return
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  useEffect(() => {
    let cancelled = false
    api
      .marketMeta()
      .then((m) => {
        if (cancelled) return
        setMeta(m)
      })
      .catch(() => {
        if (cancelled) return
        setMeta((prev) => prev ?? { governorates: [], sources: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      if (farmId == null) {
        if (!cancelled && my === seqRef.current) {
          setMine([])
          setMineReady(true)
          setMineErr('')
        }
        return
      }
      try {
        const rows = await api.farmMarketListings(farmId)
        if (cancelled || my !== seqRef.current) return
        setMine(rows)
        setMineErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        if (!isPoll) {
          setMineErr(e instanceof ApiError ? e.message : t('market.ownLoadError'))
        }
      } finally {
        if (!cancelled && my === seqRef.current) setMineReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 30_000)
    return () => {
      cancelled = true
      seqRef.current += 1
      window.clearInterval(timer)
    }
  }, [farmId, mineTick])

  function selectTab(next: Tab) {
    setTab(next)
    const btn =
      next === 'browse'
        ? browseTabRef.current
        : next === 'mine'
          ? mineTabRef.current
          : sentTabRef.current
    btn?.focus()
  }

  function onTabListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
      return
    }
    e.preventDefault()
    const i = TABS.indexOf(tab)
    if (e.key === 'Home') {
      selectTab('browse')
      return
    }
    if (e.key === 'End') {
      selectTab('sent')
      return
    }
    if (e.key === 'ArrowRight') {
      selectTab(TABS[(i + 1) % TABS.length] ?? 'browse')
      return
    }
    selectTab(TABS[(i - 1 + TABS.length) % TABS.length] ?? 'browse')
  }

  function openCreate() {
    clearMarketPrefill()
    setEditListing(null)
    setPrefillLitres(null)
    setFormOpen(true)
  }

  function onSaved(listing: MarketListing) {
    setMine((list) => {
      const i = list.findIndex((l) => l.id === listing.id)
      if (i === -1) return [listing, ...list]
      const next = list.slice()
      next[i] = listing
      return next
    })
    setHighlightId(listing.id)
    setBrowseTick((n) => n + 1)
    if (!editListing) selectTab('mine')
  }

  const newN = mine.reduce((s, l) => s + (l.new_inquiries ?? 0), 0)

  return (
    <PageFrame
      demonstration={activeFarm?.demo}
      label={t('shell.market')}
      body="contain"
      busy={tab === 'mine' ? !mineReady : undefined}
      header={
        <>
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
            {t('shell.market')}
          </h2>
          <p className="text-xs text-ink-soft">{t('market.subtitle')}</p>
        </div>
        {showAdd ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} aria-hidden />
            {t('market.list')}
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-6">
        <div
          role="tablist"
          aria-label={t('market.sections')}
          onKeyDown={onTabListKey}
          className="inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
        >
          <button
            type="button"
            role="tab"
            ref={browseTabRef}
            id="market-tab-browse"
            aria-selected={tab === 'browse'}
            aria-controls="market-panel-browse"
            tabIndex={tab === 'browse' ? 0 : -1}
            onClick={() => selectTab('browse')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'browse' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('market.browse')}
          </button>
          <button
            type="button"
            role="tab"
            ref={mineTabRef}
            id="market-tab-mine"
            aria-selected={tab === 'mine'}
            aria-controls="market-panel-mine"
            aria-label={
              newN > 0
                ? t('messages.withUnread', { label: t('market.myListings'), unread: countLabel('market.newInquiries', newN) })
                : t('market.myListings')
            }
            tabIndex={tab === 'mine' ? 0 : -1}
            onClick={() => selectTab('mine')}
            className={`inline-flex items-center rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'mine' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('market.myListings')}
            {newN > 0 ? (
              <span className="ms-1 min-w-4 rounded-full bg-hanko px-1 text-center text-[10px] leading-4 text-white">
                {newN > 99 ? '99+' : formatInt(newN)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            ref={sentTabRef}
            id="market-tab-sent"
            aria-selected={tab === 'sent'}
            aria-controls="market-panel-sent"
            tabIndex={tab === 'sent' ? 0 : -1}
            onClick={() => selectTab('sent')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'sent' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('market.sentInquiries')}
          </button>
        </div>
      </div>
        </>
      }
    >
        <div
          role="tabpanel"
          id="market-panel-browse"
          aria-labelledby="market-tab-browse"
          hidden={tab !== 'browse'}
          inert={tab !== 'browse' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <BrowseTab
            farmId={farmId}
            meta={meta}
            tick={browseTick}
            canList={showAdd}
            onOpen={setDetailId}
            onListWater={showAdd ? openCreate : undefined}
          />
        </div>
        <div
          role="tabpanel"
          id="market-panel-mine"
          aria-labelledby="market-tab-mine"
          hidden={tab !== 'mine'}
          inert={tab !== 'mine' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <MyListingsTab
            farmId={farmId}
            role={role}
            listings={mine}
            loading={!mineReady}
            loadErr={mineErr}
            highlightId={highlightId}
            onRetry={() => {
              setMineErr('')
              setMineReady(false)
              setMineTick((n) => n + 1)
            }}
            onListingsChange={setMine}
            onListWater={showAdd ? openCreate : undefined}
            onEdit={(listing) => {
              setEditListing(listing)
              setFormOpen(true)
            }}
          />
        </div>
        <div
          role="tabpanel"
          id="market-panel-sent"
          aria-labelledby="market-tab-sent"
          hidden={tab !== 'sent'}
          inert={tab !== 'sent' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <SentInquiriesTab tick={sentTick} />
        </div>

      <ListingDetailDialog
        open={detailId != null}
        listingId={detailId}
        farmId={farmId}
        onClose={() => setDetailId(null)}
        onInquirySent={() => setSentTick((n) => n + 1)}
      />
      {farmId != null ? (
        <ListingFormDialog
          open={formOpen}
          farmId={farmId}
          listing={editListing}
          prefillLitres={editListing ? null : prefillLitres}
          meta={meta}
          farmLat={activeFarm?.location_source === 'entered' ? farmLat : null}
          farmLon={activeFarm?.location_source === 'entered' ? farmLon : null}
          farmRegion={farmRegion}
          onClose={() => {
            clearMarketPrefill()
            setFormOpen(false)
            setEditListing(null)
            setPrefillLitres(null)
          }}
          onSaved={onSaved}
        />
      ) : null}
    </PageFrame>
  )
}
