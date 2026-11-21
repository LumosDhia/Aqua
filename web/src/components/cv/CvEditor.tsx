import { t } from '../../i18n'
import { useId, type ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { CvData, CvEducation, CvExperience, CvLanguage } from '../../api'
import { formatInt } from '../../lib/status'
import { TagInput } from '../TagInput'
import {
  CV_CERTS_MAX,
  CV_CERT_LEN,
  CV_DATE_MAX,
  CV_DEGREE_MAX,
  CV_EDUCATION_MAX,
  CV_EMPLOYER_MAX,
  CV_EXPERIENCE_MAX,
  CV_JOB_DESC_MAX,
  CV_LANGS_MAX,
  CV_LANG_LEN,
  CV_NAME_MAX,
  CV_PLACE_MAX,
  CV_ROLE_MAX,
  CV_SCHOOL_MAX,
  CV_SKILLS_MAX,
  CV_SKILL_LEN,
  CV_SUMMARY_MAX,
  CV_YEAR_MAX,
  LANG_LEVELS,
  languageLevelLabel,
  blankEducation,
  blankExperience,
  blankLanguage,
  isLangLevel,
} from './model'

type CvEditorProps = {
  value: CvData
  onChange: (next: CvData) => void
  disabled?: boolean
}

export function CvEditor({ value, onChange, disabled = false }: CvEditorProps) {
  const uid = useId()
  const nameId = `${uid}-name`
  const summaryId = `${uid}-summary`
  const skillsId = `${uid}-skills`
  const skillsHelpId = `${uid}-skills-help`
  const certsId = `${uid}-certs`
  const certsHelpId = `${uid}-certs-help`

  function patch(next: Partial<CvData>) {
    onChange({ ...value, ...next })
  }

  function patchExp(index: number, next: Partial<CvExperience>) {
    patch({
      experience: value.experience.map((row, i) => (i === index ? { ...row, ...next } : row)),
    })
  }

  function patchEdu(index: number, next: Partial<CvEducation>) {
    patch({
      education: value.education.map((row, i) => (i === index ? { ...row, ...next } : row)),
    })
  }

  function patchLang(index: number, next: Partial<CvLanguage>) {
    patch({
      languages: value.languages.map((row, i) => (i === index ? { ...row, ...next } : row)),
    })
  }

  const expFull = value.experience.length >= CV_EXPERIENCE_MAX
  const eduFull = value.education.length >= CV_EDUCATION_MAX
  const langFull = value.languages.length >= CV_LANGS_MAX

  return (
    <div className="page-scroll min-h-0 flex-1 space-y-4">
      <section data-card="" className="min-w-0 rounded-card border border-line bg-cream p-3 sm:p-4">
        <h3 className="font-serif text-base text-ink">{t('cv.about')}</h3>
        <div className="mt-3 space-y-3">
          <Field
            label={t('cv.name')}
            htmlFor={nameId}
            hint={`${formatInt(value.full_name.length)}/${formatInt(CV_NAME_MAX)}`}
          >
            <input
              id={nameId}
              value={value.full_name}
              onChange={(e) => patch({ full_name: e.target.value.slice(0, CV_NAME_MAX) })}
              maxLength={CV_NAME_MAX}
              disabled={disabled}
              dir="auto"
              autoComplete="name"
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
          <Field
            label={t('cv.summary')}
            htmlFor={summaryId}
            hint={`${formatInt(value.summary.length)}/${formatInt(CV_SUMMARY_MAX)}`}
          >
            <textarea
              id={summaryId}
              value={value.summary}
              onChange={(e) => patch({ summary: e.target.value.slice(0, CV_SUMMARY_MAX) })}
              maxLength={CV_SUMMARY_MAX}
              disabled={disabled}
              dir="auto"
              rows={4}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
        </div>
      </section>

      <section data-card="" className="min-w-0 rounded-card border border-line bg-cream p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-base text-ink">{t('cv.experience.title')}</h3>
          <button
            type="button"
            onClick={() => {
              if (expFull) return
              patch({ experience: [...value.experience, blankExperience()] })
            }}
            disabled={disabled || expFull}
            title={expFull ? t('cv.experience.limit', { limit: formatInt(CV_EXPERIENCE_MAX) }) : undefined}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
          >
            <Plus size={14} aria-hidden />
            {t('cv.experience.add')}
          </button>
        </div>
        {value.experience.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t('cv.experience.empty')}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {value.experience.map((row, i) => (
              <li
                key={`exp-${i}`}
                className="min-w-0 rounded-xl border border-line bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-ink-soft">{t('cv.experience.job')}{' '} {formatInt(i + 1)}</p>
                  <button
                    type="button"
                    onClick={() =>
                      patch({ experience: value.experience.filter((_, j) => j !== i) })
                    }
                    disabled={disabled}
                    aria-label={t('cv.experience.remove', { index: formatInt(i + 1) })}
                    className="rounded-full p-1 text-ink-soft hover:text-hanko disabled:opacity-60"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ShortField
                    id={`${uid}-role-${i}`}
                    label={t('common.role')}
                    value={row.role}
                    max={CV_ROLE_MAX}
                    disabled={disabled}
                    onChange={(v) => patchExp(i, { role: v })}
                  />
                  <ShortField
                    id={`${uid}-emp-${i}`}
                    label={t('cv.experience.employer')}
                    value={row.employer}
                    max={CV_EMPLOYER_MAX}
                    disabled={disabled}
                    onChange={(v) => patchExp(i, { employer: v })}
                  />
                  <ShortField
                    id={`${uid}-place-${i}`}
                    label={t('common.place')}
                    value={row.place}
                    max={CV_PLACE_MAX}
                    disabled={disabled}
                    onChange={(v) => patchExp(i, { place: v })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <ShortField
                      id={`${uid}-start-${i}`}
                      label={t('common.start')}
                      value={row.start}
                      max={CV_DATE_MAX}
                      disabled={disabled}
                      onChange={(v) => patchExp(i, { start: v })}
                    />
                    <ShortField
                      id={`${uid}-end-${i}`}
                      label={t('common.end')}
                      value={row.end}
                      max={CV_DATE_MAX}
                      disabled={disabled}
                      onChange={(v) => patchExp(i, { end: v })}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Field
                      label={t('common.description')}
                      htmlFor={`${uid}-jdesc-${i}`}
                      hint={`${formatInt(row.description.length)}/${formatInt(CV_JOB_DESC_MAX)}`}
                    >
                      <textarea
                        id={`${uid}-jdesc-${i}`}
                        value={row.description}
                        onChange={(e) =>
                          patchExp(i, { description: e.target.value.slice(0, CV_JOB_DESC_MAX) })
                        }
                        maxLength={CV_JOB_DESC_MAX}
                        disabled={disabled}
                        dir="auto"
                        rows={3}
                        className="mt-1 w-full resize-none rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink"
                      />
                    </Field>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section data-card="" className="min-w-0 rounded-card border border-line bg-cream p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-base text-ink">{t('cv.education.title')}</h3>
          <button
            type="button"
            onClick={() => {
              if (eduFull) return
              patch({ education: [...value.education, blankEducation()] })
            }}
            disabled={disabled || eduFull}
            title={eduFull ? t('cv.education.limit', { limit: formatInt(CV_EDUCATION_MAX) }) : undefined}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
          >
            <Plus size={14} aria-hidden />
            {t('cv.education.add')}
          </button>
        </div>
        {value.education.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t('cv.education.empty')}</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {value.education.map((row, i) => (
              <li
                key={`edu-${i}`}
                className="min-w-0 rounded-xl border border-line bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-ink-soft">{t('cv.education.school')}{' '} {formatInt(i + 1)}</p>
                  <button
                    type="button"
                    onClick={() =>
                      patch({ education: value.education.filter((_, j) => j !== i) })
                    }
                    disabled={disabled}
                    aria-label={t('cv.education.remove', { index: formatInt(i + 1) })}
                    className="rounded-full p-1 text-ink-soft hover:text-hanko disabled:opacity-60"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <ShortField
                    id={`${uid}-school-${i}`}
                    label={t('cv.education.school')}
                    value={row.school}
                    max={CV_SCHOOL_MAX}
                    disabled={disabled}
                    onChange={(v) => patchEdu(i, { school: v })}
                  />
                  <ShortField
                    id={`${uid}-degree-${i}`}
                    label={t('cv.education.degree')}
                    value={row.degree}
                    max={CV_DEGREE_MAX}
                    disabled={disabled}
                    onChange={(v) => patchEdu(i, { degree: v })}
                  />
                  <ShortField
                    id={`${uid}-year-${i}`}
                    label={t('cv.education.year')}
                    value={row.year}
                    max={CV_YEAR_MAX}
                    disabled={disabled}
                    onChange={(v) => patchEdu(i, { year: v })}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section data-card="" className="min-w-0 rounded-card border border-line bg-cream p-3 sm:p-4">
        <h3 className="font-serif text-base text-ink">{t('common.skills')}</h3>
        <label htmlFor={skillsId} className="mt-3 block text-xs font-medium text-ink-soft">
          {t('common.skills')}
        </label>
        <TagInput
          id={skillsId}
          tags={value.skills}
          onChange={(skills) => patch({ skills })}
          maxTags={CV_SKILLS_MAX}
          maxLength={CV_SKILL_LEN}
          disabled={disabled}
          describedBy={skillsHelpId}
          fullTitle={`You can add ${formatInt(CV_SKILLS_MAX)} skills.`}
          itemWord="skill"
        />
        <p id={skillsHelpId} className="mt-1 text-xs text-ink-soft">
          {t('cv.skillsHelp', { limit: formatInt(CV_SKILLS_MAX) })}
        </p>
      </section>

      <section data-card="" className="min-w-0 rounded-card border border-line bg-cream p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-base text-ink">{t('common.languages')}</h3>
          <button
            type="button"
            onClick={() => {
              if (langFull) return
              patch({ languages: [...value.languages, blankLanguage()] })
            }}
            disabled={disabled || langFull}
            title={langFull ? t('cv.languages.limit', { limit: formatInt(CV_LANGS_MAX) }) : undefined}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
          >
            <Plus size={14} aria-hidden />
            {t('cv.languages.add')}
          </button>
        </div>
        {value.languages.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t('cv.languages.empty')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {value.languages.map((row, i) => {
              const nameId = `${uid}-lang-${i}`
              const levelId = `${uid}-level-${i}`
              const customId = `${uid}-level-custom-${i}`
              const known = isLangLevel(row.level)
              const selectValue = row.level === '' ? '' : known ? row.level : '__other'
              return (
                <li
                  key={`lang-${i}`}
                  className="min-w-0 rounded-xl border border-line bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-ink-soft">
                      {t('common.languageEntry')}{' '} {formatInt(i + 1)}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        patch({ languages: value.languages.filter((_, j) => j !== i) })
                      }
                      disabled={disabled}
                      aria-label={t('common.removeNamed', { name: row.name.trim() || 'language' })}
                      className="rounded-full p-1 text-ink-soft hover:text-hanko disabled:opacity-60"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <ShortField
                      id={nameId}
                      label={t('common.languageEntry')}
                      value={row.name}
                      max={CV_LANG_LEN}
                      disabled={disabled}
                      onChange={(v) => patchLang(i, { name: v })}
                    />
                    <div className="min-w-0">
                      <label htmlFor={levelId} className="text-xs font-medium text-ink-soft">
                        {t('common.level')}
                      </label>
                      <select
                        id={levelId}
                        value={selectValue}
                        disabled={disabled}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '__other') {
                            patchLang(i, { level: known ? '' : row.level })
                            return
                          }
                          patchLang(i, { level: v })
                        }}
                        className="mt-1 w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink"
                      >
                        <option value="">{t('common.notSet')}</option>
                        {LANG_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {languageLevelLabel(lvl)}
                          </option>
                        ))}
                        <option value="__other">{t('common.other')}</option>
                      </select>
                    </div>
                    {selectValue === '__other' ? (
                      <div className="sm:col-span-2">
                        <ShortField
                          id={customId}
                          label={t('cv.languages.yourLevel')}
                          value={known ? '' : row.level}
                          max={CV_LANG_LEN}
                          disabled={disabled}
                          onChange={(v) => patchLang(i, { level: v })}
                        />
                      </div>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section data-card="" className="min-w-0 rounded-card border border-line bg-cream p-3 sm:p-4">
        <h3 className="font-serif text-base text-ink">{t('cv.certifications')}</h3>
        <label htmlFor={certsId} className="mt-3 block text-xs font-medium text-ink-soft">
          {t('cv.certifications')}
        </label>
        <TagInput
          id={certsId}
          tags={value.certifications}
          onChange={(certifications) => patch({ certifications })}
          maxTags={CV_CERTS_MAX}
          maxLength={CV_CERT_LEN}
          disabled={disabled}
          describedBy={certsHelpId}
          fullTitle={`You can add ${formatInt(CV_CERTS_MAX)} certifications.`}
          itemWord="certification"
        />
        <p id={certsHelpId} className="mt-1 text-xs text-ink-soft">
          {t('cv.certificationsHelp', { limit: formatInt(CV_CERTS_MAX) })}
        </p>
      </section>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-xs font-medium text-ink-soft">
          {label}
        </label>
        {hint ? <span className="text-xs text-ink-soft">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function ShortField({
  id,
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  max: number
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, max))}
        maxLength={max}
        disabled={disabled}
        dir="auto"
        className="mt-1 w-full min-w-0 rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink"
      />
    </Field>
  )
}
