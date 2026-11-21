import { t } from '../i18n'
import type { CvData } from '../api'
import { Chip } from './market/Chip'
import { Portrait } from './Portrait'

export function CvPreview({ cv, name, photo }: { cv: CvData; name?: string; photo?: string | null }) {
  const title = cv.full_name.trim() || name?.trim() || t('shell.cv')
  const summary = cv.summary.trim()
  const experience = cv.experience.filter((row) =>
    [row.role, row.employer, row.place, row.start, row.end, row.description].some((v) => v.trim()),
  )
  const education = cv.education.filter((row) =>
    [row.school, row.degree, row.year].some((v) => v.trim()),
  )
  const skills = cv.skills.filter((s) => s.trim())
  const languages = cv.languages.filter((row) => row.name.trim())
  const certifications = cv.certifications.filter((s) => s.trim())
  const empty =
    !summary &&
    experience.length === 0 &&
    education.length === 0 &&
    skills.length === 0 &&
    languages.length === 0 &&
    certifications.length === 0

  return (
    <article
      data-card=""
      className="min-w-0 rounded-card border border-line bg-cream p-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Portrait name={title} photo={photo} size="md" />
        <h3 className="min-w-0 truncate font-serif text-xl leading-tight text-ink">{title}</h3>
      </div>
      {empty ? (
        <p className="mt-2 text-sm text-ink-soft">{t('cv.empty')}</p>
      ) : (
        <div className="mt-3 space-y-4">
          {summary ? (
            <p className="whitespace-pre-wrap text-sm break-words text-ink">{summary}</p>
          ) : null}
          {experience.length > 0 ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                {t('cv.experience.title')}
              </h4>
              <ul className="mt-2 space-y-3">
                {experience.map((row, i) => {
                  const heading = [row.role.trim(), row.employer.trim()].filter(Boolean).join(' · ')
                  const when = [row.start.trim(), row.end.trim()].filter(Boolean).join(' – ')
                  const place = row.place.trim()
                  const desc = row.description.trim()
                  return (
                    <li key={`${heading}-${i}`} className="min-w-0">
                      {heading ? (
                        <p className="font-medium text-ink">{heading}</p>
                      ) : null}
                      {when || place ? (
                        <p className="text-xs text-ink-soft">
                          {[when, place].filter(Boolean).join(' · ')}
                        </p>
                      ) : null}
                      {desc ? (
                        <p className="mt-1 whitespace-pre-wrap text-sm break-words text-ink">
                          {desc}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
          {education.length > 0 ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                {t('cv.education.title')}
              </h4>
              <ul className="mt-2 space-y-2">
                {education.map((row, i) => {
                  const heading = [row.degree.trim(), row.school.trim()].filter(Boolean).join(' · ')
                  const year = row.year.trim()
                  return (
                    <li key={`${heading}-${i}`} className="min-w-0">
                      {heading ? <p className="font-medium text-ink">{heading}</p> : null}
                      {year ? <p className="text-xs text-ink-soft">{year}</p> : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}
          {skills.length > 0 ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">{t('common.skills')}</h4>
              <div className="mt-2 flex flex-wrap gap-1">
                {skills.map((s, i) => (
                  <Chip key={`${s}-${i}`}>{s}</Chip>
                ))}
              </div>
            </section>
          ) : null}
          {languages.length > 0 ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                {t('common.languages')}
              </h4>
              <div className="mt-2 flex flex-wrap gap-1">
                {languages.map((row, i) => (
                  <Chip key={`${row.name}-${i}`}>
                    {row.level.trim() ? `${row.name.trim()} · ${row.level.trim()}` : row.name.trim()}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}
          {certifications.length > 0 ? (
            <section>
              <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                {t('cv.certifications')}
              </h4>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-sm break-words text-ink">
                {certifications.map((s, i) => (
                  <li key={`${s}-${i}`}>{s}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </article>
  )
}
