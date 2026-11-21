import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { useState } from 'react'
import type { MarketListing } from '../../api'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import { Chip, SourceChip } from './Chip'
import {
  distanceLine,
  fulfilmentChips,
  photoSrc,
  priceChip,
  untilChip,
  volumeAvailable,
} from './format'

export function ListingCard({
  listing,
  onOpen,
}: {
  listing: MarketListing
  onOpen: () => void
}) {
  const [broken, setBroken] = useState(false)
  const photo = listing.photos[0]
  const showPhoto = photo && !broken
  const until = untilChip(listing.available_until)
  const distance = distanceLine(listing.distance_km)
  const collection = fulfilmentChips(listing.fulfilment, listing.delivery_radius_km)

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white text-start hover:border-forest/30"
      >
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-leaf-soft">
          {showPhoto ? (
            <img
              src={photoSrc(photo)}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-forest" aria-hidden>
              <WaterSourceIcon kind={listing.water_source} size={32} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-2.5">
          <p className="line-clamp-2 font-serif text-base leading-tight text-ink">{listing.title}</p>
          <EnteredBy record={listing} />
          <p className="truncate text-xs text-ink-soft">
            {listing.farm.name}
            {listing.governorate ? ` · ${listing.governorate}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Chip>{volumeAvailable(listing.litres_available)}</Chip>
            <Chip className="bg-ochre-soft/60 text-ink">
              {priceChip(listing.price_mode, listing.price_per_m3)}
            </Chip>
            <SourceChip kind={listing.water_source} />
            {collection.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
            {until ? <Chip>{until}</Chip> : null}
            {distance ? <Chip>{distance}</Chip> : null}
            {distance ? <AquaEstimate record={listing} note={t('estimates.distance')} /> : null}
            {listing.is_mine ? (
              <Chip className="bg-forest text-white">{t('market.yours')}</Chip>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  )
}

export function ListingCardSkeleton() {
  return (
    <li className="min-w-0 overflow-hidden rounded-card border border-line bg-white" aria-hidden>
      <div className="aqua-skel aspect-[16/10] w-full" />
      <div className="space-y-2 p-2.5">
        <div className="aqua-skel h-5 w-3/4 rounded" />
        <div className="aqua-skel h-3 w-1/2 rounded" />
        <div className="flex gap-1.5">
          <div className="aqua-skel h-5 w-20 rounded-full" />
          <div className="aqua-skel h-5 w-16 rounded-full" />
        </div>
      </div>
    </li>
  )
}
