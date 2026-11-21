import { t } from '../../i18n'
import type { DirectoryPerson } from '../../api'
import { Portrait } from '../Portrait'
import { AquaEstimate } from '../EnteredBy'
import { Chip } from '../market/Chip'
import { distanceLine } from '../market/format'

export function MemberCard({ person, onOpen }: { person: DirectoryPerson; onOpen: () => void }) {
  const distance = distanceLine(person.distance_km)
  const skills = person.skills.slice(0, 4)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-paper p-4 text-start hover:border-forest/40"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Portrait name={person.name} photo={person.photo} size="md" />
        <div className="min-w-0">
          <p className="truncate font-serif text-lg leading-tight text-ink">{person.name}</p>
          <p className="truncate text-sm text-ink-soft">{person.headline.trim() || t('common.noHeadline')}</p>
        </div>
      </div>
      <p className="truncate text-sm text-ink">
        {person.governorate.trim() || t('common.noGovernorate')}
        {distance ? ` · ${distance}` : ''}
      </p>
      {distance ? (
        <AquaEstimate record={person} note={t('estimates.governorateDistance')} />
      ) : null}
      {skills.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {skills.map((skill) => (
            <Chip key={skill}>{skill}</Chip>
          ))}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-1">
        {person.languages.slice(0, 3).map((language) => (
          <Chip key={language} className="bg-leaf-soft/70 text-forest">
            {language}
          </Chip>
        ))}
        {person.availability.trim() ? <Chip>{person.availability.trim()}</Chip> : null}
        {person.looking_for_work ? <Chip className="bg-forest text-paper">{t('common.lookingForWork')}</Chip> : null}
        {person.on_my_farm ? <Chip className="bg-cream-deep text-ink">{t('members.onFarm')}</Chip> : null}
      </div>
    </button>
  )
}
