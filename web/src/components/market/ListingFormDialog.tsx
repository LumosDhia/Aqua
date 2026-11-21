import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { MapPin, X } from 'lucide-react'
import {
  ApiError,
  api,
  type MarketFulfilment,
  type MarketListing,
  type MarketListingBody,
  type MarketListingStatus,
  type MarketMeta,
  type MarketPriceMode,
  type WaterKind,
} from '../../api'
import { litresAsM3 } from '../../lib/format'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import {
  MARKET_SOURCES,
  dateInputValue,
  isMarketSource,
  photoFilename,
  photoSrc,
} from './format'
import {
  MARKET_PHOTO_ACCEPT,
  MARKET_PHOTO_MAX,
  MARKET_PHOTO_MAX_BYTES,
  readPhotoDataUrl,
  sniffPhotoType,
  stripDataUrl,
} from './photos'

const TITLE_MIN = 3
const TITLE_MAX = 120
const DESC_MAX = 2000
const NOTES_MAX = 300
const ADDR_MAX = 200

type PhotoDraft = {
  key: string
  filename: string
  url: string
  preview: string
  uploading: boolean
}

type ListingFormDialogProps = {
  open: boolean
  farmId: number
  listing: MarketListing | null
  prefillLitres?: number | null
  meta: MarketMeta | null
  farmLat: number | null
  farmLon: number | null
  farmRegion: string
  onClose: () => void
  onSaved: (listing: MarketListing) => void
}

function parseNumber(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return Number.NaN
  return n
}

export function ListingFormDialog({
  open,
  farmId,
  listing,
  prefillLitres = null,
  meta,
  farmLat,
  farmLon,
  farmRegion,
  onClose,
  onSaved,
}: ListingFormDialogProps) {
  const titleId = useId()
  const nameId = useId()
  const descId = useId()
  const volId = useId()
  const volHelpId = useId()
  const priceId = useId()
  const sourceId = useId()
  const notesId = useId()
  const radiusId = useId()
  const fromId = useId()
  const untilId = useId()
  const govId = useId()
  const addrId = useId()
  const latId = useId()
  const lonId = useId()
  const locHelpId = useId()
  const photoId = useId()
  const statusId = useId()
  const fulfilLabelId = useId()
  const priceLabelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const keyRef = useRef(0)

  const editing = listing != null
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [volume, setVolume] = useState('')
  const [priceMode, setPriceMode] = useState<MarketPriceMode>('fixed')
  const [price, setPrice] = useState('')
  const [source, setSource] = useState<WaterKind | ''>('')
  const [notes, setNotes] = useState('')
  const [fulfilment, setFulfilment] = useState<MarketFulfilment>('pickup')
  const [radius, setRadius] = useState('')
  const [from, setFrom] = useState('')
  const [until, setUntil] = useState('')
  const [governorate, setGovernorate] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [status, setStatus] = useState<MarketListingStatus>('active')
  const [photos, setPhotos] = useState<PhotoDraft[]>([])
  const [photoErr, setPhotoErr] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dragDepth = useRef(0)
  const photosRef = useRef(photos)
  photosRef.current = photos
  const metaRef = useRef(meta)
  metaRef.current = meta

  useEffect(() => {
    if (!open) return
    setErr('')
    setPhotoErr('')
    setBusy(false)
    setDragging(false)
    dragDepth.current = 0
    if (listing) {
      setTitle(listing.title)
      setDescription(listing.description)
      setVolume(String(listing.litres_available / 1000))
      setPriceMode(listing.price_mode)
      setPrice(listing.price_per_m3 == null ? '' : String(listing.price_per_m3))
      setSource(listing.water_source)
      setNotes(listing.quality_notes)
      setFulfilment(listing.fulfilment)
      setRadius(
        listing.delivery_radius_km == null ? '' : String(listing.delivery_radius_km),
      )
      setFrom(dateInputValue(listing.available_from))
      setUntil(dateInputValue(listing.available_until))
      setGovernorate(listing.governorate)
      setAddress(listing.address_text)
      setLat(listing.lat == null ? '' : String(listing.lat))
      setLon(listing.lon == null ? '' : String(listing.lon))
      setStatus(listing.status)
      setPhotos(
        listing.photos.map((url) => ({
          key: photoFilename(url),
          filename: photoFilename(url),
          url,
          preview: photoSrc(url),
          uploading: false,
        })),
      )
    } else {
      setTitle('')
      setDescription('')
      setVolume('')
      setPriceMode('fixed')
      setPrice('')
      setSource('')
      setNotes('')
      setFulfilment('pickup')
      setRadius('')
      setFrom('')
      setUntil('')
      const match = (metaRef.current?.governorates ?? []).find(
        (g) => g.name.localeCompare(farmRegion.trim(), undefined, { sensitivity: 'base' }) === 0,
      )
      setGovernorate(match?.name ?? '')
      setAddress('')
      setLat('')
      setLon('')
      setStatus('active')
      setPhotos([])
    }
  }, [open, listing, farmRegion])

  useEffect(() => {
    if (!open || listing) return
    const match = (meta?.governorates ?? []).find(
      (g) => g.name.localeCompare(farmRegion.trim(), undefined, { sensitivity: 'base' }) === 0,
    )
    if (match) setGovernorate((prev) => prev || match.name)
  }, [open, listing, meta, farmRegion])

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

  async function addFiles(incoming: File[]) {
    setPhotoErr('')
    const already = photosRef.current.length
    const accepted: File[] = []
    let message = ''
    for (const file of incoming) {
      if (already + accepted.length >= MARKET_PHOTO_MAX) {
        message = t('market.photoLimit')
        break
      }
      if (!sniffPhotoType(file)) {
        message = t('market.photoType')
        continue
      }
      if (file.size > MARKET_PHOTO_MAX_BYTES) {
        message = t('market.photoTooLarge')
        continue
      }
      accepted.push(file)
    }
    if (message) setPhotoErr(message)
    for (const file of accepted) {
      keyRef.current += 1
      const key = `up-${keyRef.current}`
      let preview = ''
      let data = ''
      try {
        const dataUrl = await readPhotoDataUrl(file)
        preview = dataUrl
        data = stripDataUrl(dataUrl)
      } catch {
        setPhotoErr(t('common.errorFileRead'))
        continue
      }
      const draft: PhotoDraft = {
        key,
        filename: '',
        url: '',
        preview,
        uploading: true,
      }
      setPhotos((list) => (list.length >= MARKET_PHOTO_MAX ? list : [...list, draft]))
      try {
        const saved = await api.uploadMarketPhoto(farmId, data)
        setPhotos((list) =>
          list.map((p) =>
            p.key === key
              ? {
                  key,
                  filename: saved.filename,
                  url: saved.url,
                  preview: photoSrc(saved.url),
                  uploading: false,
                }
              : p,
          ),
        )
      } catch (error) {
        setPhotos((list) => list.filter((p) => p.key !== key))
        setPhotoErr(
          error instanceof ApiError ? error.message : t('market.photoUploadError'),
        )
      }
    }
  }

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  function onDragEnter(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    if (dragDepth.current === 0) return
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void addFiles(Array.from(e.dataTransfer.files))
  }

  function useFarmLocation() {
    if (farmLat == null || farmLon == null) return
    setLat(String(farmLat))
    setLon(String(farmLon))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (trimmed.length < TITLE_MIN) {
      setErr(t('common.titleMinimum'))
      return
    }
    if (trimmed.length > TITLE_MAX) {
      setErr(t('common.titleLimit'))
      return
    }
    const desc = description.trim()
    if (desc.length > DESC_MAX) {
      setErr(t('common.descriptionLimit'))
      return
    }
    const m3 = parseNumber(volume)
    if (m3 == null || Number.isNaN(m3) || m3 <= 0) {
      setErr(t('market.volumeRequired'))
      return
    }
    let priceN: number | null = null
    if (priceMode === 'fixed') {
      const n = parseNumber(price)
      if (n == null || Number.isNaN(n) || n < 0) {
        setErr(t('market.priceRequired'))
        return
      }
      priceN = n
    }
    if (!source) {
      setErr(t('market.sourceRequired'))
      return
    }
    const notesTrim = notes.trim()
    if (notesTrim.length > NOTES_MAX) {
      setErr(t('market.qualityLimit'))
      return
    }
    let radiusN: number | null = null
    if (fulfilment === 'delivery' || fulfilment === 'both') {
      const n = parseNumber(radius)
      if (n == null || Number.isNaN(n) || n <= 0) {
        setErr(t('market.deliveryRequired'))
        return
      }
      radiusN = Math.round(n)
    }
    if (!governorate) {
      setErr(t('common.governorateInvalid'))
      return
    }
    const addr = address.trim()
    if (addr.length > ADDR_MAX) {
      setErr(t('common.addressLimit'))
      return
    }
    const latN = parseNumber(lat)
    const lonN = parseNumber(lon)
    if (latN != null && Number.isNaN(latN)) {
      setErr(t('market.latitudeNumeric'))
      return
    }
    if (lonN != null && Number.isNaN(lonN)) {
      setErr(t('market.longitudeNumeric'))
      return
    }
    if ((latN == null) !== (lonN == null)) {
      setErr(t('market.coordinatesPair'))
      return
    }
    if (latN != null && (latN < -90 || latN > 90)) {
      setErr(t('market.latitudeRange'))
      return
    }
    if (lonN != null && (lonN < -180 || lonN > 180)) {
      setErr(t('market.longitudeRange'))
      return
    }
    if (from && until && from > until) {
      setErr(t('market.dateOrder'))
      return
    }
    if (photosRef.current.some((p) => p.uploading)) {
      setErr(t('market.waitPhotos'))
      return
    }
    const body: MarketListingBody = {
      title: trimmed,
      description: desc,
      litres_available: Math.round(m3 * 1000),
      price_mode: priceMode,
      price_per_m3: priceN,
      water_source: source,
      quality_notes: notesTrim,
      fulfilment,
      delivery_radius_km: radiusN,
      available_from: from || null,
      available_until: until || null,
      governorate,
      address_text: addr,
      lat: latN,
      lon: lonN,
      photos: photosRef.current.map((p) => p.filename).filter((n) => n !== ''),
      status: editing ? status : 'active',
    }
    setBusy(true)
    setErr('')
    try {
      const saved = listing
        ? await api.updateMarketListing(farmId, listing.id, body)
        : await api.createMarketListing(farmId, body)
      onSaved(saved)
      onClose()
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : editing
            ? t('market.saveError')
            : t('market.publishError'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const atPhotoMax = photos.length >= MARKET_PHOTO_MAX
  const locTitle =
    farmLat == null || farmLon == null ? t('market.noPin') : undefined
  const govs = meta?.governorates ?? []

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
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {editing ? t('market.edit') : t('market.list')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        {listing ? <EnteredBy record={listing} /> : null}
          <Field label={t('common.title')} htmlFor={nameId}>
            <input
              id={nameId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              minLength={TITLE_MIN}
              required
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
          <Field label={t('common.description')} htmlFor={descId}>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={4}
              disabled={busy}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p className="mt-1 text-end text-xs text-ink-soft">
              {description.length}/{DESC_MAX}
            </p>
          </Field>
          {!listing && prefillLitres != null ? (
            <p className="text-xs text-ink-soft">
              <AquaEstimate note={t('market.surplusEstimate')} />{' '}
              {t('market.surplusVolume', { volume: litresAsM3(prefillLitres) })}
            </p>
          ) : null}
          <Field label={t('market.volume')} htmlFor={volId}>
            <input
              id={volId}
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              required
              disabled={busy}
              aria-describedby={volHelpId}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p id={volHelpId} className="mt-1 text-xs text-ink-soft">
              1 m³ = 1,000 litres
            </p>
          </Field>
          <div>
            <p className="text-xs font-medium text-ink-soft" id={priceLabelId}>
              {t('market.price')}
            </p>
            <div
              role="group"
              aria-labelledby={priceLabelId}
              className="mt-1 inline-flex max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-sm"
            >
              <SegBtn
                pressed={priceMode === 'fixed'}
                onClick={() => setPriceMode('fixed')}
                disabled={busy}
              >
                {t('market.fixedPrice')}
              </SegBtn>
              <SegBtn
                pressed={priceMode === 'free'}
                onClick={() => setPriceMode('free')}
                disabled={busy}
              >
                {t('market.free')}
              </SegBtn>
              <SegBtn
                pressed={priceMode === 'negotiable'}
                onClick={() => setPriceMode('negotiable')}
                disabled={busy}
              >
                {t('market.negotiable')}
              </SegBtn>
            </div>
            {priceMode === 'fixed' ? (
              <Field label={t('market.pricePerUnit')} htmlFor={priceId}>
                <input
                  id={priceId}
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
              </Field>
            ) : null}
          </div>
          <Field label={t('market.waterSource')} htmlFor={sourceId}>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              {source ? <WaterSourceIcon kind={source} size={18} className="shrink-0 text-forest" /> : null}
              <select
                id={sourceId}
                value={source}
                onChange={(e) => {
                  const next = e.target.value
                  if (isMarketSource(next)) setSource(next)
                }}
                disabled={busy}
                className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="" disabled>{t('market.selectSource')}</option>
                {MARKET_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label={t('market.quality')} htmlFor={notesId}>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={NOTES_MAX}
              rows={2}
              disabled={busy}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
            />
          </Field>
          <div>
            <p className="text-xs font-medium text-ink-soft" id={fulfilLabelId}>
              {t('market.collection')}
            </p>
            <div
              role="group"
              aria-labelledby={fulfilLabelId}
              className="mt-1 inline-flex max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-sm"
            >
              <SegBtn
                pressed={fulfilment === 'pickup'}
                onClick={() => setFulfilment('pickup')}
                disabled={busy}
              >
                {t('market.pickup')}
              </SegBtn>
              <SegBtn
                pressed={fulfilment === 'delivery'}
                onClick={() => setFulfilment('delivery')}
                disabled={busy}
              >
                {t('market.delivery')}
              </SegBtn>
              <SegBtn
                pressed={fulfilment === 'both'}
                onClick={() => setFulfilment('both')}
                disabled={busy}
              >
                {t('market.both')}
              </SegBtn>
            </div>
            {fulfilment === 'delivery' || fulfilment === 'both' ? (
              <Field label={t('market.deliveryRange')} htmlFor={radiusId}>
                <input
                  id={radiusId}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
              </Field>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('market.availableFrom')} htmlFor={fromId}>
              <input
                id={fromId}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </Field>
            <Field label={t('market.availableUntil')} htmlFor={untilId}>
              <input
                id={untilId}
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </Field>
          </div>
          <Field label={t('common.governorate')} htmlFor={govId}>
            <select
              id={govId}
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              required
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="">{t('common.chooseGovernorate')}</option>
              {govs.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('market.address')} htmlFor={addrId}>
            <input
              id={addrId}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={ADDR_MAX}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
          <div>
            <p className="text-xs font-medium text-ink-soft">{t('market.mapLocation')}</p>
            <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t('market.latitude')} htmlFor={latId}>
                <input
                  id={latId}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  disabled={busy}
                  aria-describedby={locHelpId}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
              </Field>
              <Field label={t('market.longitude')} htmlFor={lonId}>
                <input
                  id={lonId}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  disabled={busy}
                  aria-describedby={locHelpId}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
              </Field>
            </div>
            <span title={locTitle} className="mt-2 inline-flex">
              <button
                type="button"
                onClick={useFarmLocation}
                disabled={busy || farmLat == null || farmLon == null}
                title={locTitle}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
              >
                <MapPin size={14} aria-hidden />
                {t('market.useFarmLocation')}
              </button>
            </span>
            <p id={locHelpId} className="mt-1 text-xs text-ink-soft">
              {t('market.locationHelp')}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft">{t('market.photos')}</p>
            <div
              onDragEnter={onDragEnter}
              onDragLeave={onDragLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className={`mt-1 rounded-xl border border-dashed p-4 ${
                dragging ? 'border-ochre bg-ochre/10' : 'border-line bg-cream'
              }`}
            >
              <input
                id={photoId}
                type="file"
                accept={MARKET_PHOTO_ACCEPT}
                multiple
                disabled={busy || atPhotoMax}
                onChange={(e) => {
                  const list = e.target.files
                  if (list) void addFiles(Array.from(list))
                  e.target.value = ''
                }}
                className="sr-only"
              />
              <label
                htmlFor={photoId}
                className={`block text-center text-sm ${
                  atPhotoMax ? 'cursor-not-allowed text-ink-soft' : 'cursor-pointer text-ink'
                }`}
              >
                {atPhotoMax
                  ? t('market.photoLimit')
                  : dragging
                    ? t('market.dropPhotos')
                    : t('market.browsePhotos')}
              </label>
              <p className="mt-1 text-center text-xs text-ink-soft">
                {t('market.photoLimits')}
              </p>
            </div>
            {photos.length > 0 ? (
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {photos.map((p, i) => (
                  <li
                    key={p.key}
                    className="relative aspect-square overflow-hidden rounded-xl bg-leaf-soft"
                  >
                    {p.preview ? (
                      <img src={p.preview} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    {p.uploading ? (
                      <div className="absolute inset-0 flex items-center justify-center bg-forest-deep/45 text-xs font-medium text-white">
                        {t('market.uploading')}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setPhotos((list) => list.filter((x) => x.key !== p.key))
                        }
                        aria-label={t('market.removePhoto', { index: i + 1 })}
                        className="absolute top-1 end-1 rounded-full bg-white/90 p-1 text-ink-soft hover:text-hanko"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
            {photoErr ? (
              <p className="mt-1 text-sm text-hanko" role="alert">
                {photoErr}
              </p>
            ) : null}
          </div>
          {editing ? (
            <Field label={t('common.status')} htmlFor={statusId}>
              <select
                id={statusId}
                value={status}
                onChange={(e) => setStatus(e.target.value as MarketListingStatus)}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="active">{t('common.active')}</option>
                <option value="paused">{t('market.paused')}</option>
                <option value="closed">{t('common.closed')}</option>
              </select>
            </Field>
          ) : null}
          {err ? (
            <p className="text-sm text-hanko" role="alert">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy
                ? editing
                  ? t('common.saving')
                  : t('common.publishing')
                : editing
                  ? t('common.saveChanges')
                  : t('market.publish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  )
}

function SegBtn({
  pressed,
  onClick,
  disabled,
  children,
}: {
  pressed: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 ${
        pressed ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
      }`}
    >
      {children}
    </button>
  )
}
