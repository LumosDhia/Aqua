import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ExternalLink, Send, X } from 'lucide-react'
import { ApiError, api, type MarketInquiry, type MarketListing } from '../../api'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import { Chip, SourceChip } from './Chip'
import {
  distanceLine,
  formatDay,
  fulfilmentText,
  listingStatusMeta,
  osmHref,
  photoSrc,
  priceChip,
  inquiryStatusMeta,
  volumeAvailable,
} from './format'

const MSG_MIN = 5
const MSG_MAX = 1000

type ListingDetailDialogProps = {
  open: boolean
  listingId: number | null
  farmId: number | null
  onClose: () => void
  onInquirySent?: () => void
}

export function ListingDetailDialog({
  open,
  listingId,
  farmId,
  onClose,
  onInquirySent,
}: ListingDetailDialogProps) {
  const titleId = useId()
  const msgId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [listing, setListing] = useState<MarketListing | null>(null)
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [photoI, setPhotoI] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const [sent, setSent] = useState<MarketInquiry | null>(null)
  const seqRef = useRef(0)
  const listingRef = useRef<MarketListing | null>(null)
  listingRef.current = listing

  useEffect(() => {
    if (!open) return
    setListing(null)
    setReady(false)
    setLoadErr('')
    setPhotoI(0)
    setMessage('')
    setBusy(false)
    setSendErr('')
    setSent(null)
  }, [open, listingId])

  useEffect(() => {
    if (!open || listingId == null) return
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')

    api
      .marketListing(listingId, farmId ?? undefined)
      .then((row) => {
        if (cancelled || my !== seqRef.current) return
        setListing(row)
        setSent(row.my_inquiry ?? null)
        setLoadErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setListing(null)
        if (e instanceof ApiError && e.status === 404) {
          setLoadErr(t('market.listingMissing'))
        } else {
          setLoadErr(e instanceof ApiError ? e.message : t('market.listingLoadError'))
        }
      })
      .finally(() => {
        if (!cancelled && my === seqRef.current) setReady(true)
      })

    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [open, listingId, farmId])

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
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        const n = listingRef.current?.photos.length ?? 0
        if (n <= 1) return
        e.preventDefault()
        setPhotoI((i) => (e.key === 'ArrowRight' ? (i + 1) % n : (i - 1 + n) % n))
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
    if (listingId == null) return
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
      const inquiry = await api.sendMarketInquiry(listingId, trimmed)
      setSent(inquiry)
      setListing((row) => (row ? { ...row, my_inquiry: inquiry } : row))
      onInquirySent?.()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setSendErr(
          error.message === 'That email is already in use.'
            ? t('market.alreadyContacted')
            : error.message,
        )
        try {
          const row = await api.marketListing(listingId, farmId ?? undefined)
          setListing(row)
          if (row.my_inquiry) {
            setSent(row.my_inquiry)
            onInquirySent?.()
          }
        } catch {
          /* keep the 409 message */
        }
      } else if (error instanceof ApiError && error.status === 404) {
        setSendErr(t('market.listingMissing'))
      } else {
        setSendErr(error instanceof ApiError ? error.message : t('market.sendError'))
      }
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const photos = listing?.photos ?? []
  const main = photos[photoI]
  const thumbs = photos.slice(0, 4)
  const inquiry = sent ?? listing?.my_inquiry ?? null
  const status = listing ? listingStatusMeta(listing.status) : null
  const distance = listing ? distanceLine(listing.distance_km) : null
  const inquiryChip = inquiry ? inquiryStatusMeta(inquiry.status, true) : null

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
            {listing?.title ?? t('common.listing')}
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

        {listing ? <EnteredBy record={listing} /> : null}
        {!ready ? (
          <div className="mt-4 space-y-3" aria-hidden>
            <div className="aqua-skel aspect-[4/3] w-full rounded-xl" />
            <div className="aqua-skel h-4 w-2/3 rounded" />
            <div className="aqua-skel h-4 w-1/2 rounded" />
            <div className="aqua-skel h-20 w-full rounded" />
          </div>
        ) : loadErr ? (
          <p className="mt-4 text-sm text-hanko" role="alert">
            {loadErr}
          </p>
        ) : listing ? (
          <div className="mt-4 space-y-4">
            <div>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-leaf-soft">
                {main ? (
                  <img
                    src={photoSrc(main)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-forest"
                    aria-hidden
                  >
                    <WaterSourceIcon kind={listing.water_source} size={40} />
                  </div>
                )}
              </div>
              {thumbs.length > 1 ? (
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t('market.photos')}>
                  {thumbs.map((url, i) => (
                    <button
                      key={`${url}-${i}`}
                      type="button"
                      onClick={() => setPhotoI(i)}
                      aria-label={t('market.photoIndex', { index: i + 1, total: photos.length })}
                      aria-pressed={photoI === i}
                      className={`h-14 w-[4.5rem] overflow-hidden rounded-lg ${
                        photoI === i ? 'ring-2 ring-forest ring-offset-2' : ''
                      }`}
                    >
                      <img src={photoSrc(url)} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <p className="text-sm text-ink-soft">
                {listing.farm.name}
                {listing.farm.region ? ` · ${listing.farm.region}` : ''}
              </p>
              {listing.status !== 'active' && status ? (
                <div className="mt-2">
                  <Chip className={status.className}>{status.label}</Chip>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Chip>{volumeAvailable(listing.litres_available)}</Chip>
                <Chip className="bg-ochre-soft/60 text-ink">
                  {priceChip(listing.price_mode, listing.price_per_m3)}
                </Chip>
                <SourceChip kind={listing.water_source} />
              </div>
            </div>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('market.quality')}</dt>
                <dd className="text-ink">{listing.quality_notes.trim() || t('common.notSet')}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('market.collection')}</dt>
                <dd className="text-ink">
                  {fulfilmentText(listing.fulfilment, listing.delivery_radius_km)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('market.available')}</dt>
                <dd className="text-ink">
                  {listing.available_from && listing.available_until
                    ? t('market.availablePeriod', { startDate: formatDay(listing.available_from), endDate: formatDay(listing.available_until) })
                    : listing.available_from
                      ? t('common.fromDate', { date: formatDay(listing.available_from) })
                      : listing.available_until
                        ? t('common.untilDate', { date: formatDay(listing.available_until) })
                        : t('common.notSet')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-ink-soft">{t('common.location')}</dt>
                <dd className="text-ink">
                  {[listing.governorate, listing.address_text].filter(Boolean).join(' · ') || t('common.notSet')}
                </dd>
              </div>
            </dl>

            {listing.lat != null && listing.lon != null ? (
              <p className="text-sm">
                <a
                  href={osmHref(listing.lat, listing.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-forest underline-offset-2 hover:underline"
                >
                  {t('common.mapLink')}
                  <ExternalLink size={14} aria-hidden />
                </a>
                {distance ? <AquaEstimate record={listing} note={t('estimates.distance')} /> : null}
                {distance ? <span className="mt-1 block text-ink-soft">{distance}</span> : null}
              </p>
            ) : distance ? (
              <p className="text-sm text-ink-soft">{distance}{' '}<AquaEstimate record={listing} note={t('estimates.distance')} /></p>
            ) : null}

            {listing.description.trim() ? (
              <p className="whitespace-pre-wrap text-sm break-words text-ink">
                {listing.description}
              </p>
            ) : null}

            <div className="border-t border-line pt-4">
              {listing.is_mine ? (
                <p className="text-sm text-ink-soft">{t('market.own')}</p>
              ) : inquiry ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <p className="text-ink">
                    {t('market.contactedOn')}{' '} {formatDay(inquiry.created_at)}
                  </p>
                    <EnteredBy record={inquiry} />
                  {inquiryChip ? (
                    <Chip className={inquiryChip.className}>{inquiryChip.label}</Chip>
                  ) : null}
                </div>
              ) : (
                <form onSubmit={(e) => void onSend(e)} className="space-y-2">
                  <label htmlFor={msgId} className="text-xs font-medium text-ink-soft">
                    {t('market.inquiryPrompt')}
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
                  {sendErr ? (
                    <p className="text-sm text-hanko" role="alert">
                      {sendErr}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={busy || message.trim().length < MSG_MIN}
                    className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    <Send className="rtl:-scale-x-100" size={16} aria-hidden />
                    {busy ? t('common.sending') : t('market.send')}
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
