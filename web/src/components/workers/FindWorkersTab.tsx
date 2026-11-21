import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'
import {
  ApiError,
  api,
  type Candidate,
  type Job,
  type JobKind,
} from '../../api'
import { formatInt } from '../../lib/status'
import { Portrait } from '../Portrait'
import { PersonDialog } from '../PersonDialog'
import { InviteWorkerDialog } from './InviteWorkerDialog'
import { TagInput } from '../TagInput'
import { Chip } from '../market/Chip'
import {
  JOB_KINDS,
  candidateReachLine,
  casedMatching,
  kindChip,
  kindChipClass,
} from '../jobs/format'

const PAGE = 24
const RADIUS_MIN = 5
const RADIUS_MAX = 300
const SKILL_MAX = 30
const SKILLS_MAX = 12

type FindWorkersTabProps = {
  farmId: number | null
}

function clampRadius(n: number): number {
  if (!Number.isFinite(n)) return 50
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(n)))
}

export function FindWorkersTab({ farmId }: FindWorkersTabProps) {
  const searchId = useId()
  const radiusId = useId()
  const jobIdAttr = useId()
  const kindsId = useId()
  const skillsId = useId()
  const skillsHelpId = useId()

  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [radius, setRadius] = useState(50)
  const [radiusDeb, setRadiusDeb] = useState(50)
  const [jobId, setJobId] = useState('')
  const [kinds, setKinds] = useState<JobKind[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [skillErr, setSkillErr] = useState('')
  const [openJobs, setOpenJobs] = useState<Job[]>([])

  const [items, setItems] = useState<Candidate[]>([])
  const [total, setTotal] = useState(0)
  const [ready, setReady] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [profileId, setProfileId] = useState<number | null>(null)
  const [inviting, setInviting] = useState<{ user_id: number; name: string } | null>(null)
  const [invited, setInvited] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (farmId == null) return
    let active = true
    api
      .farmJobOffers(farmId)
      .then((rows) => {
        if (active) setInvited(new Set(rows.filter((o) => o.status === 'pending' && o.worker).map((o) => o.worker!.id)))
      })
      .catch(() => {
        /* the chips just start empty */
      })
    return () => {
      active = false
    }
  }, [farmId])

  const itemsRef = useRef(items)
  itemsRef.current = items
  const seqRef = useRef(0)

  useEffect(() => {
    if (q === qDeb) return
    const t = window.setTimeout(() => setQDeb(q), 300)
    return () => window.clearTimeout(t)
  }, [q, qDeb])

  useEffect(() => {
    if (radius === radiusDeb) return
    const t = window.setTimeout(() => setRadiusDeb(radius), 250)
    return () => window.clearTimeout(t)
  }, [radius, radiusDeb])

  useEffect(() => {
    if (farmId == null) return
    let cancelled = false
    api
      .farmJobs(farmId)
      .then((rows) => {
        if (cancelled) return
        setOpenJobs(rows.filter((j) => j.status === 'open'))
      })
      .catch(() => {
        if (cancelled) return
        setOpenJobs([])
      })
    return () => {
      cancelled = true
    }
  }, [farmId])

  useEffect(() => {
    if (farmId == null) {
      setReady(true)
      setItems([])
      setTotal(0)
      setLoadErr('')
      return
    }

    const id = farmId

    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')
    setItems([])
    setTotal(0)

    async function load() {
      try {
        const page = await api.farmCandidates(id, {
          radius_km: radiusDeb,
          job_id: jobId ? Number(jobId) : undefined,
          kinds,
          skills,
          q: qDeb.trim() || undefined,
          limit: PAGE,
          offset: 0,
        })
        if (cancelled || my !== seqRef.current) return
        setItems(page.items)
        setTotal(page.total)
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        setItems([])
        setTotal(0)
        setLoadErr(e instanceof ApiError ? e.message : t('workers.loadError'))
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load()
    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [farmId, qDeb, radiusDeb, jobId, kinds, skills, retryTick])

  async function loadMore() {
    if (farmId == null || moreBusy || itemsRef.current.length >= total) return
    setMoreBusy(true)
    const my = seqRef.current
    try {
      const page = await api.farmCandidates(farmId, {
        radius_km: radiusDeb,
        job_id: jobId ? Number(jobId) : undefined,
        kinds,
        skills,
        q: qDeb.trim() || undefined,
        limit: PAGE,
        offset: itemsRef.current.length,
      })
      if (my !== seqRef.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((c) => c.user_id))
        return [...prev, ...page.items.filter((c) => !seen.has(c.user_id))]
      })
      setTotal(page.total)
      setLoadErr('')
    } catch (e) {
      if (my !== seqRef.current) return
      setLoadErr(e instanceof ApiError ? e.message : t('workers.loadError'))
    } finally {
      setMoreBusy(false)
    }
  }

  function toggleKind(id: JobKind) {
    setKinds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]))
  }

  function onPickJob(next: string) {
    setJobId(next)
    if (!next) return
    const job = openJobs.find((j) => String(j.id) === next)
    if (!job) return
    setKinds([job.kind])
    setSkills(job.skills.slice())
  }

  function widen() {
    setRadius((r) => Math.min(RADIUS_MAX, r + 50))
  }

  const showEmpty = ready && !loadErr && items.length === 0 && farmId != null
  const atMax = radius >= RADIUS_MAX

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="shrink-0 space-y-1.5">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative min-w-[10rem] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-soft"
              aria-hidden
            />
            <label htmlFor={searchId} className="sr-only">
              {t('workers.searchPeople')}
            </label>
            <input
              id={searchId}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('workers.searchPeople')}
              autoComplete="off"
              className="w-full rounded-full bg-cream py-1.5 pe-3 ps-8 text-sm text-ink placeholder:text-ink-soft"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={radiusId} className="text-xs font-medium text-ink-soft">
              {t('workers.lookWithin')}{' '} {formatInt(radius)} {' '}{t('workers.fromFarm')}
            </label>
            <input
              id={radiusId}
              type="range"
              min={RADIUS_MIN}
              max={RADIUS_MAX}
              step={1}
              value={radius}
              aria-valuetext={`${formatInt(radius)} kilometres`}
              onChange={(e) => setRadius(clampRadius(Number(e.target.value)))}
              className="mt-1 w-full accent-forest"
            />
            <p className="mt-1 text-xs text-ink-soft">
              {t('workers.travelMatching')}
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <label htmlFor={jobIdAttr} className="text-xs font-medium text-ink-soft">
            {t('workers.lookingFor')}
          </label>
          <select
            id={jobIdAttr}
            value={jobId}
            onChange={(e) => onPickJob(e.target.value)}
            className="mt-1 w-full min-w-0 rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm text-ink"
          >
            <option value="">{t('workers.anyWork')}</option>
            {openJobs.map((j) => (
              <option key={j.id} value={String(j.id)}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-soft" id={kindsId}>
            {t('jobs.kind')}
          </p>
          <div
            role="group"
            aria-labelledby={kindsId}
            className="mt-1 flex max-w-full flex-wrap gap-1"
          >
            {JOB_KINDS.map((k) => {
              const on = kinds.includes(k.id)
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleKind(k.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    on
                      ? 'bg-forest-deep text-white'
                      : 'border border-line bg-white text-ink-soft'
                  }`}
                >
                  {k.label}
                </button>
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
            tags={skills}
            onChange={(tags) => {
              setSkills(tags)
              setSkillErr('')
            }}
            maxTags={SKILLS_MAX}
            maxLength={SKILL_MAX}
            describedBy={skillsHelpId}
            fullTitle="You can add up to 12 skills"
            itemWord={t('forms.skill')}
            onError={setSkillErr}
          />
          <p id={skillsHelpId} className="sr-only">
            {t('jobs.skillInput')}
          </p>
          {skillErr ? (
            <p className="mt-1 text-xs text-hanko" role="alert">
              {skillErr}
            </p>
          ) : null}
        </div>
        <p className="text-xs text-ink-soft" aria-live="polite">
          {ready && !loadErr && farmId != null
            ? total === 1
              ? '1 person'
              : `${formatInt(total)} people`
            : '\u00a0'}
        </p>
      </div>

      {loadErr ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
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

      <div className="page-scroll min-h-0 flex-1">
        {farmId == null ? (
          <p className="text-sm text-ink-soft">{t('workers.joinForSearch')}</p>
        ) : !ready ? (
          <CandidateGridSkeleton />
        ) : loadErr && items.length === 0 ? null : showEmpty ? (
          <EmptyState
            text={t('workers.nobodyNearby', { distance: formatInt(radius) })}
            action={atMax
              ? { label: t('jobs.widen'), disabledReason: t('jobs.maxDistance') }
              : { label: t('jobs.widenTo', { distance: formatInt(Math.min(RADIUS_MAX, radius + 50)) }), onClick: widen }}
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((c) => (
                <CandidateCard
                  key={c.user_id}
                  candidate={c}
                  onView={() => setProfileId(c.user_id)}
                  invited={invited.has(c.user_id)}
                  onInvite={() => setInviting({ user_id: c.user_id, name: c.name })}
                />
              ))}
            </ul>
            {items.length < total ? (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={moreBusy}
                  className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {moreBusy ? t('common.loading') : t('common.loadMore')}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <InviteWorkerDialog
        open={inviting != null && farmId != null}
        farmId={farmId ?? 0}
        worker={inviting}
        onClose={() => setInviting(null)}
        onSent={(id) => setInvited((prev) => new Set(prev).add(id))}
      />
      <PersonDialog
        open={profileId != null}
        userId={profileId}
        onClose={() => setProfileId(null)}
      />
    </div>
  )
}

function CandidateCard({
  candidate,
  onView,
  onInvite,
  invited,
}: {
  candidate: Candidate
  onView: () => void
  onInvite: () => void
  invited: boolean
}) {
  const matching = new Set(casedMatching(candidate.skills, candidate.matching_skills).map((s) => s.toLowerCase()))
  const reach = candidateReachLine(candidate.distance_km, candidate.their_radius_km)

  return (
    <li data-card="" className="min-w-0 rounded-card border border-line bg-white p-3">
      <div className="flex min-w-0 items-start gap-3">
        <Portrait name={candidate.name} photo={candidate.photo} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight text-ink">{candidate.name}</p>
          <EnteredBy record={candidate} />
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {candidate.headline.trim() || t('common.noHeadline')}
          </p>
          <p className="mt-1 truncate text-xs text-ink">
            {candidate.governorate || t('common.locationMissing')}
          </p>
          <p className="mt-1 text-xs text-ink-soft">{reach}</p>
          <AquaEstimate record={candidate} note={t('estimates.skillsDistance')} />
          {candidate.skills.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {candidate.skills.map((s, i) => {
                const hit = matching.has(s.toLowerCase())
                return (
                  <Chip
                    key={`${s}-${i}`}
                    className={hit ? 'bg-leaf-soft/70 text-forest' : undefined}
                  >
                    <span className="inline-flex max-w-full items-center gap-1">
                      {hit ? <Check size={10} aria-hidden /> : null}
                      {hit ? <span className="sr-only">{t('workers.match')}{' '} </span> : null}
                      <span className="truncate">{s}</span>
                    </span>
                  </Chip>
                )
              })}
            </div>
          ) : null}
          {candidate.languages.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {candidate.languages.map((s, i) => (
                <Chip key={`${s}-${i}`}>{s}</Chip>
              ))}
            </div>
          ) : null}
          {candidate.availability.trim() ? (
            <p className="mt-1.5 text-xs text-ink-soft">{candidate.availability}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {candidate.kinds.map((k) => (
              <Chip key={k} className={kindChipClass(k)}>
                {kindChip(k)}
              </Chip>
            ))}
            {candidate.has_cv ? (
              <Chip className="bg-cream-deep text-ink">{t('shell.cv')}</Chip>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {invited ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-leaf-soft/70 px-3 py-1.5 text-xs font-medium text-forest">
                <Check size={12} aria-hidden /> {' '}{t('workers.invited')}
              </span>
            ) : (
              <button
                type="button"
                onClick={onInvite}
                className="inline-flex items-center rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
              >
                {t('workers.inviteToWork')}
              </button>
            )}
            <button
              type="button"
              onClick={onView}
              className="inline-flex items-center rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
            >
              {t('common.viewProfile')}
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

function CandidateGridSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="min-w-0 rounded-card border border-line bg-white p-3">
          <div className="flex gap-3">
            <div className="aqua-skel h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="aqua-skel h-4 w-2/3 rounded" />
              <div className="aqua-skel h-3 w-1/2 rounded" />
              <div className="aqua-skel h-3 w-1/3 rounded" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
