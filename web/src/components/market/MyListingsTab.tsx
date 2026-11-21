import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useRef, useState } from 'react'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'
import {
  ApiError,
  api,
  canManageMarket,
  type MarketInquiry,
  type MarketListing,
  type MarketListingStatus,
} from '../../api'
import { formatInt } from '../../lib/status'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import { PersonDialog } from '../PersonDialog'
import { Chip, SourceChip } from './Chip'
import {
  inquiriesCount,
  listingStatusMeta,
  listingToBody,
  photoSrc,
  priceChip,
  inquiryStatusMeta,
  volumeAvailable,
} from './format'

type MyListingsTabProps = {
  farmId: number | null
  role: string
  listings: MarketListing[]
  loading: boolean
  loadErr: string
  highlightId: number | null
  onRetry: () => void
  onListingsChange: (next: MarketListing[] | ((prev: MarketListing[]) => MarketListing[])) => void
  onListWater?: () => void
  onEdit: (listing: MarketListing) => void
}

export function MyListingsTab({
  farmId,
  role,
  listings,
  loading,
  loadErr,
  highlightId,
  onRetry,
  onListingsChange,
  onListWater,
  onEdit,
}: MyListingsTabProps) {
  const canManage = canManageMarket(role)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [rowErr, setRowErr] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [inquiries, setInquiries] = useState<MarketInquiry[]>([])
  const [inqReady, setInqReady] = useState(!canManage)
  const [inqErr, setInqErr] = useState('')
  const [inqTick, setInqTick] = useState(0)
  const [profileId, setProfileId] = useState<number | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    setConfirmId(null)
    setRowErr('')
    setBusyId(null)
    setInquiries([])
    setInqReady(!canManage)
    setInqErr('')
    setProfileId(null)
  }, [farmId, canManage])

  useEffect(() => {
    if (!canManage || farmId == null) return
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setInqReady(false)

    api
      .farmMarketInquiries(farmId)
      .then((rows) => {
        if (cancelled || my !== seqRef.current) return
        setInquiries(rows)
        setInqErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setInqErr(e instanceof ApiError ? e.message : t('market.inquiriesError'))
      })
      .finally(() => {
        if (!cancelled && my === seqRef.current) setInqReady(true)
      })

    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [farmId, canManage, inqTick])

  async function toggleStatus(listing: MarketListing) {
    if (farmId == null) return
    const next: MarketListingStatus = listing.status === 'active' ? 'paused' : 'active'
    setBusyId(listing.id)
    setRowErr('')
    try {
      const saved = await api.updateMarketListing(farmId, listing.id, {
        ...listingToBody(listing),
        status: next,
      })
      onListingsChange((list) => list.map((l) => (l.id === saved.id ? saved : l)))
    } catch (error) {
      setRowErr(error instanceof ApiError ? error.message : t('market.updateError'))
    } finally {
      setBusyId(null)
    }
  }

  async function onRemove(listing: MarketListing) {
    if (farmId == null) return
    setRowErr('')
    try {
      await api.deleteMarketListing(farmId, listing.id)
      onListingsChange((list) => list.filter((l) => l.id !== listing.id))
      setConfirmId(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onListingsChange((list) => list.filter((l) => l.id !== listing.id))
        setConfirmId(null)
        return
      }
      setRowErr(error instanceof ApiError ? error.message : t('market.deleteError'))
    }
  }

  async function patchInquiry(
    inquiry: MarketInquiry,
    status: 'read' | 'accepted' | 'declined',
  ) {
    setRowErr('')
    try {
      const saved = await api.updateMarketInquiry(inquiry.id, status)
      setInquiries((list) => list.map((i) => (i.id === saved.id ? saved : i)))
      if (status === 'read' && inquiry.status === 'new') {
        onListingsChange((list) =>
          list.map((l) =>
            l.id === inquiry.listing_id
              ? { ...l, new_inquiries: l.new_inquiries == null ? undefined : Math.max(0, l.new_inquiries - 1) }
              : l,
          ),
        )
      }
    } catch (error) {
      setRowErr(error instanceof ApiError ? error.message : t('market.updateInquiryError'))
    }
  }

  if (loadErr && listings.length === 0) {
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
          <li key={i} className="flex gap-3 rounded-card border border-line bg-white p-3">
            <div className="aqua-skel h-16 w-20 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="aqua-skel h-4 w-2/3 rounded" />
              <div className="aqua-skel h-3 w-1/2 rounded" />
            </div>
          </li>
        ))}
      </ul>
    )
  }

  if (listings.length === 0) {
    return (
      <EmptyState text={t('market.ownEmpty')} action={canManage && onListWater
        ? { label: t('market.list'), onClick: onListWater }
        : { label: t('market.list'), disabledReason: t('market.noListingPermission') }} />
    )
  }

  return (
    <div className="grid h-full min-h-0 gap-6 xl:grid-cols-2">
      <div className="flex min-h-0 min-w-0 flex-col">
        <h3 className="shrink-0 font-serif text-base text-ink">{t('market.yourListings')}</h3>
        {rowErr ? (
          <p className="mt-2 shrink-0 text-sm text-hanko" role="alert">
            {rowErr}
          </p>
        ) : null}
        <ul className="page-scroll mt-3 min-h-0 flex-1 space-y-3">
          {listings.map((l) => (
            <MineRow
              key={l.id}
              listing={l}
              canManage={canManage}
              confirm={confirmId === l.id}
              highlight={highlightId === l.id}
              busy={busyId === l.id}
              onEdit={() => onEdit(l)}
              onToggle={() => void toggleStatus(l)}
              onAskRemove={() => {
                setConfirmId(l.id)
                setRowErr('')
              }}
              onCancelRemove={() => {
                setConfirmId(null)
                setRowErr('')
              }}
              onRemove={() => void onRemove(l)}
            />
          ))}
        </ul>
      </div>
      <div className="flex min-h-0 min-w-0 flex-col">
        <h3 className="shrink-0 font-serif text-base text-ink">{t('market.inquiries')}</h3>
        {canManage ? (
          inqErr && inquiries.length === 0 && inqReady ? (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
            >
              <p>{inqErr}</p>
              <button
                type="button"
                onClick={() => {
                  setInqErr('')
                  setInqTick((n) => n + 1)
                }}
                className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
              >
                {t('common.retry')}
              </button>
            </div>
          ) : !inqReady ? (
            <ul className="mt-3 space-y-2" aria-hidden>
              {[0, 1].map((i) => (
                <li key={i} className="rounded-card border border-line bg-white p-3">
                  <div className="aqua-skel h-4 w-1/2 rounded" />
                  <div className="aqua-skel mt-2 h-3 w-full rounded" />
                </li>
              ))}
            </ul>
          ) : inquiries.length === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">{t('market.noInquiries')}</p>
          ) : (
            <ul className="page-scroll mt-3 min-h-0 flex-1 space-y-2">
              {inquiries.map((inq) => (
                <InquiryRow
                  key={inq.id}
                  inquiry={inq}
                  onRead={() => void patchInquiry(inq, 'read')}
                  onAccept={() => void patchInquiry(inq, 'accepted')}
                  onDecline={() => void patchInquiry(inq, 'declined')}
                  onViewProfile={
                    inq.sender
                      ? () => {
                          const id = inq.sender?.id
                          if (id != null) setProfileId(id)
                        }
                      : undefined
                  }
                />
              ))}
            </ul>
          )
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            {t('market.inquiryPermission')}
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

function MineRow({
  listing,
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
  listing: MarketListing
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
  const status = listingStatusMeta(listing.status)
  const photo = listing.photos[0]
  const paused = listing.status !== 'active'
  const newN = listing.new_inquiries ?? 0
  const count = listing.inquiry_count

  return (
    <li
      data-card=""
      className={`min-w-0 rounded-card border border-line p-3 ${
        highlight ? 'bg-leaf-soft/40 ring-2 ring-leaf' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-leaf-soft">
          {photo ? (
            <img src={photoSrc(photo)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-forest" aria-hidden>
              <WaterSourceIcon kind={listing.water_source} size={18} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 truncate font-serif text-lg leading-tight text-ink">
              {listing.title}
            </p>
            <EnteredBy record={listing} />
            <Chip className={status.className}>{status.label}</Chip>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip>{volumeAvailable(listing.litres_available)}</Chip>
            <Chip className="bg-ochre-soft/60 text-ink">
              {priceChip(listing.price_mode, listing.price_per_m3)}
            </Chip>
            <SourceChip kind={listing.water_source} />
            <Chip>{count == null ? t('common.countMissing') : inquiriesCount(count)}</Chip>
            {newN > 0 ? (
              <Chip className="bg-hanko text-white">
                {newN > 99 ? '99+' : formatInt(newN)} new
              </Chip>
            ) : null}
          </div>
          {canManage && confirm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <p className="text-ink">{t('market.deleteConfirm')}</p>
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
                {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
                {paused ? t('common.resume') : t('common.pause')}
              </button>
              <button
                type="button"
                onClick={onAskRemove}
                aria-label={t('common.deleteNamed', { name: listing.title })}
                className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink hover:text-hanko"
              >
                <Trash2 size={14} aria-hidden />
                {t('common.delete')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function InquiryRow({
  inquiry,
  onRead,
  onAccept,
  onDecline,
  onViewProfile,
}: {
  inquiry: MarketInquiry
  onRead: () => void
  onAccept: () => void
  onDecline: () => void
  onViewProfile?: () => void
}) {
  const chip = inquiryStatusMeta(inquiry.status, false)
  const isNew = inquiry.status === 'new'
  const sender = inquiry.sender

  return (
    <li
      className={`min-w-0 rounded-card border border-line p-3 ${
        isNew ? 'bg-leaf-soft/40' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {sender ? (
            <>
              <p className="truncate font-medium text-ink">{sender.name}</p>
              <a
                href={`mailto:${sender.email}`}
                className="truncate text-xs text-forest underline-offset-2 hover:underline"
              >
                {sender.email}
              </a>
            </>
          ) : (
            <p className="text-sm text-ink-soft">{t('market.farmer')}</p>
          )}
        </div>
        <Chip className={chip.className}>{chip.label}</Chip>
      </div>
      <p className="mt-1 truncate text-xs text-ink-soft">{inquiry.listing_title}</p>
      <p className="mt-1 text-sm break-words text-ink">{inquiry.message}</p>
      <EnteredBy record={inquiry} />
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
        {inquiry.status === 'new' ? (
          <button
            type="button"
            onClick={onRead}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink"
          >
            {t('market.markRead')}
          </button>
        ) : null}
        {inquiry.status !== 'accepted' ? (
          <button
            type="button"
            onClick={onAccept}
            className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
          >
            {t('common.accept')}
          </button>
        ) : null}
        {inquiry.status !== 'declined' ? (
          <button
            type="button"
            onClick={onDecline}
            className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink"
          >
            {t('common.decline')}
          </button>
        ) : null}
      </div>
    </li>
  )
}
