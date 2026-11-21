import { t } from '../i18n'
import { EnteredBy } from './EnteredBy'
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import {
  ApiError,
  api,
  type MarketMeta,
  type MyProfile,
  type ProfileBody,
  type ProfileKind,
  type ProfileVisibility,
} from '../api'
import { formatInt } from '../lib/status'
import { Portrait } from './Portrait'
import { Chip } from './market/Chip'
import { PageFrame } from './PageFrame'
import { MyReportsCard } from './reports/MyReportsCard'
import { TagInput } from './TagInput'

const HEADLINE_MAX = 120
const BIO_MAX = 1500
const AVAIL_MAX = 200
const SKILLS_MAX = 12
const LANGS_MAX = 6
const TAG_MAX = 30
const RADIUS_MIN = 1
const RADIUS_MAX = 300

const KINDS: { id: ProfileKind; label: string }[] = [
  { id: 'task', get label() { return t('jobs.oneOffPlural') } },
  { id: 'period', get label() { return t('jobs.fixedTerm') } },
  { id: 'long_term', get label() { return t('jobs.longTerm') } },
]

type FormState = {
  headline: string
  bio: string
  governorate: string
  visibility: ProfileVisibility
  radius_km: number
  looking_for_work: boolean
  kinds: ProfileKind[]
  skills: string[]
  languages: string[]
  availability: string
}

function fromProfile(p: MyProfile): FormState {
  return {
    headline: p.headline,
    bio: p.bio,
    governorate: p.governorate,
    visibility: p.visibility === 'private' ? 'private' : 'public',
    radius_km: Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, p.radius_km)),
    looking_for_work: p.looking_for_work,
    kinds: KINDS.map((k) => k.id).filter((id) => p.kinds.includes(id)),
    skills: p.skills.slice(0, SKILLS_MAX),
    languages: p.languages.slice(0, LANGS_MAX),
    availability: p.availability,
  }
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.headline === b.headline &&
    a.bio === b.bio &&
    a.governorate === b.governorate &&
    a.visibility === b.visibility &&
    a.radius_km === b.radius_km &&
    a.looking_for_work === b.looking_for_work &&
    a.kinds.join('\0') === b.kinds.join('\0') &&
    a.skills.join('\0') === b.skills.join('\0') &&
    a.languages.join('\0') === b.languages.join('\0') &&
    a.availability === b.availability
  )
}

function isKind(value: string): value is ProfileKind {
  return value === 'task' || value === 'period' || value === 'long_term'
}

export function ProfilePanel() {
  const headlineId = useId()
  const bioId = useId()
  const govId = useId()
  const visLabelId = useId()
  const radiusId = useId()
  const workId = useId()
  const kindsLabelId = useId()
  const skillsId = useId()
  const skillsHelpId = useId()
  const langsId = useId()
  const langsHelpId = useId()
  const availId = useId()

  const [meta, setMeta] = useState<MarketMeta | null>(null)
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [saved, setSaved] = useState<FormState | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [name, setName] = useState('')
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    api
      .marketMeta()
      .then((m) => {
        if (!cancelled) setMeta(m)
      })
      .catch(() => {
        if (!cancelled) setMeta((prev) => prev ?? { governorates: [], sources: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setLoadErr('')
    setErr('')
    setJustSaved(false)
    api
      .profileMe()
      .then((p) => {
        if (cancelled) return
        const next = fromProfile(p)
        setProfile(p)
        setSaved(next)
        setForm(next)
        setName(p.name)
        setLoadErr('')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoadErr(e instanceof ApiError ? e.message : t('profile.loadError'))
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  useEffect(() => {
    if (!justSaved) return
    const t = window.setTimeout(() => setJustSaved(false), 2500)
    return () => window.clearTimeout(t)
  }, [justSaved])

  const dirty = form != null && saved != null && !sameForm(form, saved)
  const complete = Boolean(form?.headline.trim() && form.governorate)
  const govs = meta?.governorates ?? []

  const preview = useMemo(() => {
    if (!form) return null
    return {
      name,
      headline: form.headline.trim(),
      governorate: form.governorate,
      skills: form.skills,
      visibility: form.visibility,
      photo: profile?.photo ?? null,
    }
  }, [form, name, profile?.photo])

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
    setErr('')
    setJustSaved(false)
  }

  function onVisKey(e: KeyboardEvent<HTMLDivElement>) {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'ArrowDown'
    ) {
      return
    }
    e.preventDefault()
    if (!form) return
    const next: ProfileVisibility = form.visibility === 'public' ? 'private' : 'public'
    patch('visibility', next)
    const root = e.currentTarget
    root.querySelector<HTMLElement>(`[data-vis="${next}"]`)?.focus()
  }

  function toggleKind(id: ProfileKind) {
    setForm((prev) => {
      if (!prev) return prev
      const has = prev.kinds.includes(id)
      return {
        ...prev,
        kinds: has ? prev.kinds.filter((k) => k !== id) : [...prev.kinds, id],
      }
    })
    setErr('')
    setJustSaved(false)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    const headline = form.headline.trim()
    if (headline.length > HEADLINE_MAX) {
      setErr(t('profile.headlineLimit'))
      return
    }
    const bio = form.bio.trim()
    if (bio.length > BIO_MAX) {
      setErr(t('profile.aboutLimit'))
      return
    }
    const availability = form.availability.trim()
    if (availability.length > AVAIL_MAX) {
      setErr(t('profile.availabilityLimit'))
      return
    }
    if (form.skills.some((s) => !s.trim() || s.length > TAG_MAX)) {
      setErr(t('profile.skillLimit'))
      return
    }
    if (form.languages.some((s) => !s.trim() || s.length > TAG_MAX)) {
      setErr(t('profile.languageLimit'))
      return
    }
    if (form.skills.length > SKILLS_MAX) {
      setErr(t('profile.skillCount'))
      return
    }
    if (form.languages.length > LANGS_MAX) {
      setErr(t('profile.languageCount'))
      return
    }
    if (form.governorate && !govs.some((g) => g.name === form.governorate)) {
      setErr(t('common.governorateInvalid'))
      return
    }
    const radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(form.radius_km)))
    const body: ProfileBody = {
      headline,
      bio,
      governorate: form.governorate,
      visibility: form.visibility,
      radius_km: radius,
      looking_for_work: form.looking_for_work,
      kinds: form.kinds.filter(isKind),
      skills: form.skills,
      languages: form.languages,
      availability,
    }
    setBusy(true)
    setErr('')
    try {
      const p = await api.updateProfile(body)
      const next = fromProfile(p)
      setProfile(p)
      setSaved(next)
      setForm(next)
      setName(p.name)
      setJustSaved(true)
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('profile.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageFrame
      demonstration={profile?.demo}
      label={t('shell.profile')}
      busy={!ready}
      header={
        <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
              {t('shell.profile')}
            </h2>
            <p className="text-xs text-ink-soft">{t('profile.subtitle')}</p>
          </div>
          {form ? (
            <span
              className={`inline-flex max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-medium ${
                complete ? 'bg-leaf-soft/70 text-forest' : 'bg-ochre-soft/60 text-ink'
              }`}
            >
              {complete ? t('profile.complete') : t('profile.headlineLocation')}
            </span>
          ) : null}
        </header>
      }
    >
      {loadErr ? (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
        >
          <p>{loadErr}</p>
          <button
            type="button"
            onClick={() => {
              setLoadErr('')
              setRetryTick((n) => n + 1)
            }}
            className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
      {!ready ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]" aria-hidden>
          <div className="space-y-2">
            <div className="aqua-skel h-10 rounded-xl" />
            <div className="aqua-skel h-24 rounded-xl" />
            <div className="aqua-skel h-10 rounded-xl" />
            <div className="aqua-skel h-16 rounded-xl" />
          </div>
          <div className="aqua-skel h-48 rounded-card" />
        </div>
      ) : form ? (
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
          <form className="min-w-0 space-y-3" onSubmit={(e) => void submit(e)}>
            <Field label={t('profile.headline')} htmlFor={headlineId} hint={t('profile.headlineHelp')}>
              <input
                id={headlineId}
                value={form.headline}
                onChange={(e) => patch('headline', e.target.value)}
                maxLength={HEADLINE_MAX}
                placeholder={t('profile.specialty')}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </Field>
            <Field label={t('profile.about')} htmlFor={bioId}>
              <textarea
                id={bioId}
                value={form.bio}
                onChange={(e) => patch('bio', e.target.value)}
                maxLength={BIO_MAX}
                rows={4}
                disabled={busy}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1 text-end text-xs text-ink-soft">
                {formatInt(form.bio.length)}/{formatInt(BIO_MAX)}
              </p>
            </Field>
            <Field label={t('profile.where')} htmlFor={govId} hint={t('profile.whereHelp')}>
              <select
                id={govId}
                value={form.governorate}
                onChange={(e) => patch('governorate', e.target.value)}
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
            <div>
              <p className="text-xs font-medium text-ink-soft" id={visLabelId}>
                {t('profile.visibility')}
              </p>
              <div
                role="radiogroup"
                aria-labelledby={visLabelId}
                onKeyDown={onVisKey}
                className="mt-1 grid gap-2"
              >
                <VisOption
                  checked={form.visibility === 'public'}
                  disabled={busy}
                  vis="public"
                  title={t('profile.public')}
                  help={t('profile.publicHelp')}
                  onSelect={() => patch('visibility', 'public')}
                />
                <VisOption
                  checked={form.visibility === 'private'}
                  disabled={busy}
                  vis="private"
                  title={t('profile.private')}
                  help={t('profile.privateHelp')}
                  onSelect={() => patch('visibility', 'private')}
                />
              </div>
            </div>
            <Field
              label={t('profile.travel')}
              htmlFor={radiusId}
              hint={`${formatInt(form.radius_km)} km`}
            >
              <input
                id={radiusId}
                type="range"
                min={RADIUS_MIN}
                max={RADIUS_MAX}
                step={1}
                value={form.radius_km}
                aria-valuetext={`${formatInt(form.radius_km)} kilometres`}
                onChange={(e) => patch('radius_km', Number(e.target.value))}
                disabled={busy}
                className="mt-1 w-full accent-forest"
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor={workId} className="text-xs font-medium text-ink-soft">
                {t('profile.looking')}
              </label>
              <button
                id={workId}
                type="button"
                role="switch"
                aria-checked={form.looking_for_work}
                disabled={busy}
                onClick={() => patch('looking_for_work', !form.looking_for_work)}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${
                  form.looking_for_work
                    ? 'bg-forest-deep text-white'
                    : 'border border-line bg-white text-ink-soft'
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 rounded-full ${
                    form.looking_for_work ? 'bg-leaf' : 'bg-mute'
                  }`}
                />
                {form.looking_for_work ? t('common.yes') : t('common.no')}
              </button>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-soft" id={kindsLabelId}>
                {t('profile.workTypes')}
              </p>
              <div className="mt-1 flex flex-col gap-1.5" role="group" aria-labelledby={kindsLabelId}>
                {KINDS.map((k) => {
                  const cid = `${kindsLabelId}-${k.id}`
                  return (
                    <label key={k.id} htmlFor={cid} className="inline-flex items-center gap-2 text-sm text-ink">
                      <input
                        id={cid}
                        type="checkbox"
                        checked={form.kinds.includes(k.id)}
                        onChange={() => toggleKind(k.id)}
                        disabled={busy}
                        className="h-4 w-4 rounded border-line text-forest accent-forest"
                      />
                      {k.label}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="min-w-0">
              <label htmlFor={skillsId} className="text-xs font-medium text-ink-soft">
                {t('common.skills')}
              </label>
              <TagInput
                id={skillsId}
                tags={form.skills}
                onChange={(tags) => {
                  setForm((prev) => (prev ? { ...prev, skills: tags } : prev))
                  setJustSaved(false)
                }}
                maxTags={SKILLS_MAX}
                maxLength={TAG_MAX}
                disabled={busy}
                describedBy={skillsHelpId}
                fullTitle="You can add up to 12 skills"
                itemWord={t('forms.skill')}
                onError={setErr}
              />
              <p id={skillsHelpId} className="mt-1 text-xs text-ink-soft">
                {t('profile.skillInput')}
              </p>
            </div>
            <div className="min-w-0">
              <label htmlFor={langsId} className="text-xs font-medium text-ink-soft">
                {t('common.languages')}
              </label>
              <TagInput
                id={langsId}
                tags={form.languages}
                onChange={(tags) => {
                  setForm((prev) => (prev ? { ...prev, languages: tags } : prev))
                  setJustSaved(false)
                }}
                maxTags={LANGS_MAX}
                maxLength={TAG_MAX}
                disabled={busy}
                describedBy={langsHelpId}
                fullTitle="You can add up to 6 languages"
                itemWord={t('forms.language')}
                onError={setErr}
              />
              <p id={langsHelpId} className="mt-1 text-xs text-ink-soft">
                {t('profile.languageInput')}
              </p>
            </div>
            <Field label={t('profile.availability')} htmlFor={availId} hint={t('profile.availabilityHelp')}>
              <input
                id={availId}
                value={form.availability}
                onChange={(e) => patch('availability', e.target.value)}
                maxLength={AVAIL_MAX}
                placeholder={t('profile.availabilityPlaceholder')}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </Field>
            {err ? (
              <p className="text-sm text-hanko" role="alert">
                {err}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={busy || !dirty}
            title={!dirty ? t('profile.saveHint') : undefined}
                className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? t('common.saving') : t('common.saveChanges')}
              </button>
              {justSaved ? (
                <p className="text-sm text-forest" aria-live="polite">
                  {t('common.saved')}
                </p>
              ) : null}
            </div>
          </form>

          <aside
            data-card=""
            className="min-w-0 rounded-card border border-line bg-cream p-4 lg:sticky lg:top-0"
          >
            <p className="text-xs font-medium tracking-wide text-ink-soft uppercase">
              {t('profile.preview')}
            </p>
            {preview ? <PreviewCard preview={preview} /> : null}
            {profile?.entered_by || profile?.updated_by ? <EnteredBy record={profile} own /> : null}
          </aside>
        </div>
      ) : null}
      <MyReportsCard />
      </div>
    </PageFrame>
  )
}

function PreviewCard({
  preview,
}: {
  preview: {
    name: string
    headline: string
    governorate: string
    skills: string[]
    visibility: ProfileVisibility
    photo: string | null
  }
}) {
  const vis =
    preview.visibility === 'public'
      ? { label: t('profile.public'), className: 'bg-leaf-soft/70 text-forest' }
      : { label: t('profile.private'), className: 'bg-cream-deep text-ink-soft' }
  return (
    <div className="mt-3 min-w-0">
      <div className="flex items-center gap-3">
        <Portrait name={preview.name || t('common.you')} photo={preview.photo} size="md" />
        <div className="min-w-0">
          <p className="truncate font-serif text-lg leading-tight text-ink">{preview.name || t('common.you')}</p>
          <p className="truncate text-sm text-ink-soft">
            {preview.headline || t('profile.noHeadline')}
          </p>
        </div>
      </div>
      <p className="mt-3 truncate text-sm text-ink">
        {preview.governorate || t('profile.noGovernorate')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Chip className={vis.className}>{vis.label}</Chip>
        {preview.skills.length === 0 ? (
          <Chip className="bg-white text-ink-soft">{t('profile.noSkills')}</Chip>
        ) : (
          preview.skills.map((s, i) => <Chip key={`${s}-${i}`}>{s}</Chip>)
        )}
      </div>
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

function VisOption({
  checked,
  disabled,
  title,
  help,
  vis,
  onSelect,
}: {
  checked: boolean
  disabled: boolean
  title: string
  help: string
  vis: ProfileVisibility
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      data-vis={vis}
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      disabled={disabled}
      onClick={onSelect}
      className={`rounded-card border px-3 py-2 text-start ${
        checked ? 'border-forest bg-leaf-soft/40' : 'border-line bg-white'
      }`}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <span
          aria-hidden
          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
            checked ? 'border-forest' : 'border-mute'
          }`}
        >
          {checked ? <span className="h-2 w-2 rounded-full bg-forest" /> : null}
        </span>
        {title}
      </span>
      <span className="mt-1 block text-xs leading-snug text-ink-soft">{help}</span>
    </button>
  )
}
