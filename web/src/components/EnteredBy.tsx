import { t, activeLocale } from '../i18n'
import type { Attribution, EstimateBasis, RecordActor } from '../api'

const relative = () => new Intl.RelativeTimeFormat(activeLocale(), { numeric: 'auto' })
const fullDate = () => new Intl.DateTimeFormat(activeLocale(), { dateStyle: 'full', timeStyle: 'long' })
const timeUnits = [
  ['year', 365 * 86400],
  ['month', 30 * 86400],
  ['week', 7 * 86400],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
] as const

function EntryTime({ actor, label }: { actor: RecordActor; label: string }) {
  const date = new Date(actor.at)
  if (!Number.isFinite(date.getTime())) return <span>{label}</span>

  const seconds = (date.getTime() - Date.now()) / 1000
  const [unit, size] = timeUnits.find(([, length]) => Math.abs(seconds) >= length) ?? timeUnits[6]

  return (
    <span>
      {label}{' · '}
      <time dateTime={actor.at} title={fullDate().format(date)}>
        {relative().format(Math.trunc(seconds / size), unit)}
      </time>
    </span>
  )
}

export function EnteredBy({ record, own = false, verb = 'Added' }: { record: Attribution; own?: boolean; verb?: 'Added' | 'Recorded' }) {
  const { entered_by: added, updated_by: edited } = record
  return (
    <span className="block min-w-0 break-words text-[11px] leading-snug text-ink-soft">
      {added ? <EntryTime actor={added} label={own ? t('dashboard.enteredByYou') : t('dashboard.enteredBy', { action: verb === 'Added' ? t('dashboard.added') : t('dashboard.recorded'), name: added.name })} /> : t('dashboard.unknownAuthor')}
      {edited ? <><br /><EntryTime actor={edited} label={own ? t('dashboard.editedByYou') : t('dashboard.editedBy', { name: edited.name })} /></> : null}
    </span>
  )
}

export function AquaEstimate({ record, note }: { record?: EstimateBasis; note?: string }) {
  if (record?.basis !== 'aqua_estimate' && !note) return null
  return (
    <span
      className="inline-block max-w-full rounded-full bg-cream-deep px-2 py-0.5 text-[11px] leading-snug text-ink-soft"
      title={record?.basis_note || note}
    >
      {t('dashboard.aquaEstimate')}
    </span>
  )
}
