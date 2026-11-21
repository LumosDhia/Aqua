import { t } from '../../i18n'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import type { Job } from '../../api'
import { formatInt } from '../../lib/status'
import { Chip } from '../market/Chip'
import {
  distanceLine,
  jobDates,
  jobStatusMeta,
  kindChip,
  kindChipClass,
  payLine,
} from './format'

export function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const dates = jobDates(job.kind, job.start_date, job.end_date)
  const distance = distanceLine(job.distance_km)
  const skills = job.skills.slice(0, 4)
  const filled = job.status === 'filled'
  const filledMeta = filled ? jobStatusMeta('filled') : null

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white p-2.5 text-start hover:border-forest/30"
      >
        <p className="line-clamp-2 font-serif text-base leading-tight text-ink">{job.title}</p>
        <EnteredBy record={job} />
        <p className="mt-1 truncate text-xs text-ink-soft">
          {job.farm.name}
          {job.governorate ? ` · ${job.governorate}` : ''}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Chip className={kindChipClass(job.kind)}>{kindChip(job.kind)}</Chip>
          <Chip className="bg-ochre-soft/60 text-ink">
            {payLine(job.pay_mode, job.pay_amount, job.pay_unit)}
          </Chip>
          {dates ? <Chip>{dates}</Chip> : null}
          {job.workers_needed > 1 ? (
            <Chip>{t('jobs.workersNeededLabel', { workers: formatInt(job.workers_needed) })}</Chip>
          ) : null}
          {skills.map((s, i) => (
            <Chip key={`${s}-${i}`}>{s}</Chip>
          ))}
          {distance ? <Chip>{distance}</Chip> : null}
          {distance ? <AquaEstimate record={job} note={t('estimates.distance')} /> : null}
          {filledMeta ? (
            <Chip className={filledMeta.className}>{filledMeta.label}</Chip>
          ) : null}
        </div>
      </button>
    </li>
  )
}

export function JobCardSkeleton() {
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
