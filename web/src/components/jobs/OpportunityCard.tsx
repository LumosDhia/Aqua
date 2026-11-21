import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import type { Opportunity } from '../../api'
import { Chip } from '../market/Chip'
import {
  casedMatching,
  fromYouLine,
  jobDates,
  kindChip,
  kindChipClass,
  matchSkillsLine,
  payLine,
  shownWithinLine,
} from './format'

export function OpportunityCard({
  item,
  onOpen,
}: {
  item: Opportunity
  onOpen: () => void
}) {
  const dates = jobDates(item.kind, item.start_date, item.end_date)
  const distance = fromYouLine(item.distance_km)
  const reach = shownWithinLine(item.job_radius_km)
  const matching = casedMatching(item.skills, item.matching_skills)
  const match = matchSkillsLine(item.match, matching)

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white p-2.5 text-start hover:border-forest/30"
      >
        <p className="line-clamp-2 font-serif text-base leading-tight text-ink">{item.title}</p>
        <EnteredBy record={item} />
        <p className="mt-1 truncate text-xs text-ink-soft">
          {item.farm.name}
          {item.governorate ? ` · ${item.governorate}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip className={kindChipClass(item.kind)}>{kindChip(item.kind)}</Chip>
          <Chip className="bg-ochre-soft/60 text-ink">
            {payLine(item.pay_mode, item.pay_amount, item.pay_unit)}
          </Chip>
          {dates ? <Chip>{dates}</Chip> : null}
          {distance ? <Chip>{distance}</Chip> : null}
          {distance || match ? <AquaEstimate record={item} note={t('estimates.skillsDistance')} /> : null}
          {match ? <Chip className="bg-leaf-soft/70 text-forest">{match}</Chip> : null}
          {reach ? <Chip>{reach}</Chip> : null}
          {item.applied ? (
            <Chip className="bg-teal/15 text-forest">{t('jobs.applied')}</Chip>
          ) : null}
        </div>
      </button>
    </li>
  )
}

export function OpportunityCardSkeleton() {
  return (
    <li className="min-w-0 overflow-hidden rounded-card border border-line bg-white p-3" aria-hidden>
      <div className="space-y-2">
        <div className="aqua-skel h-5 w-3/4 rounded" />
        <div className="aqua-skel h-3 w-1/2 rounded" />
        <div className="flex gap-1.5">
          <div className="aqua-skel h-5 w-16 rounded-full" />
          <div className="aqua-skel h-5 w-24 rounded-full" />
          <div className="aqua-skel h-5 w-20 rounded-full" />
        </div>
      </div>
    </li>
  )
}
