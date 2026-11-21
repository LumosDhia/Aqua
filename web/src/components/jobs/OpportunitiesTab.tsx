import { t } from '../../i18n'
import { AquaEstimate } from '../EnteredBy'
import { EmptyState } from '../EmptyState'
import { useEffect, useId, useRef, useState } from 'react'
import { MapPin, Search } from 'lucide-react'
import { ApiError, api, type JobKind, type Opportunity } from '../../api'
import { formatInt } from '../../lib/status'
import { VIEW_HREF } from '../../lib/view'
import { TagInput } from '../TagInput'
import { OpportunityCard, OpportunityCardSkeleton } from './OpportunityCard'
import { isJobKind, JOB_KINDS, jobsWithinLine } from './format'

const PAGE = 24
const RADIUS_MIN = 5
const RADIUS_MAX = 300
const SKILL_MAX = 30
const SKILLS_MAX = 12

type OpportunitiesTabProps = {
  location: string
  initialRadius: number
  initialKinds: JobKind[]
  initialSkills: string[]
  tick: number
  onOpen: (id: number) => void
}

function clampRadius(n: number): number {
  if (!Number.isFinite(n)) return 50
  return Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, Math.round(n)))
}

export function OpportunitiesTab({
  location,
  initialRadius,
  initialKinds,
  initialSkills,
  tick,
  onOpen,
}: OpportunitiesTabProps) {
  const searchId = useId()
  const radiusId = useId()
  const kindsId = useId()
  const skillsId = useId()
  const skillsHelpId = useId()

  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [radius, setRadius] = useState(() => clampRadius(initialRadius))
  const [radiusDeb, setRadiusDeb] = useState(() => clampRadius(initialRadius))
  const [kinds, setKinds] = useState<JobKind[]>(() => initialKinds.filter(isJobKind))
  const [skills, setSkills] = useState<string[]>(() => initialSkills.slice())
  const [skillErr, setSkillErr] = useState('')

  const [items, setItems] = useState<Opportunity[]>([])
  const [total, setTotal] = useState(0)
  const [resultLocation, setResultLocation] = useState(location)
  const [resultRadius, setResultRadius] = useState(() => clampRadius(initialRadius))
  const [ready, setReady] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [needLocation, setNeedLocation] = useState(!location)
  const [retryTick, setRetryTick] = useState(0)

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
    if (!location) {
      setNeedLocation(true)
      setReady(true)
      setItems([])
      setTotal(0)
      setLoadErr('')
      return
    }

    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')
    setNeedLocation(false)
    setItems([])
    setTotal(0)

    async function load() {
      try {
        const page = await api.opportunities({
          radius_km: radiusDeb,
          kinds,
          skills,
          q: qDeb.trim() || undefined,
          limit: PAGE,
          offset: 0,
        })
        if (cancelled || my !== seqRef.current) return
        setItems(page.items)
        setTotal(page.total)
        setResultLocation(page.location)
        setResultRadius(page.radius_km)
        setLoadErr('')
        setNeedLocation(false)
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        setItems([])
        setTotal(0)
        if (
          e instanceof ApiError &&
          e.status === 422 &&
          e.message.toLowerCase().includes('where you live')
        ) {
          setNeedLocation(true)
          setLoadErr('')
        } else {
          setNeedLocation(false)
          setLoadErr(e instanceof ApiError ? e.message : t('jobs.loadError'))
        }
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load()
    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [qDeb, radiusDeb, kinds, skills, location, tick, retryTick])

  async function loadMore() {
    if (moreBusy || itemsRef.current.length >= total) return
    setMoreBusy(true)
    const my = seqRef.current
    try {
      const page = await api.opportunities({
        radius_km: radiusDeb,
        kinds,
        skills,
        q: qDeb.trim() || undefined,
        limit: PAGE,
        offset: itemsRef.current.length,
      })
      if (my !== seqRef.current) return
      setItems((prev) => {
        const seen = new Set(prev.map((j) => j.id))
        return [...prev, ...page.items.filter((j) => !seen.has(j.id))]
      })
      setTotal(page.total)
      setResultLocation(page.location)
      setResultRadius(page.radius_km)
      setLoadErr('')
    } catch (e) {
      if (my !== seqRef.current) return
      if (
        e instanceof ApiError &&
        e.status === 422 &&
        e.message.toLowerCase().includes('where you live')
      ) {
        setNeedLocation(true)
        setLoadErr('')
      } else {
        setLoadErr(e instanceof ApiError ? e.message : t('jobs.loadError'))
      }
    } finally {
      setMoreBusy(false)
    }
  }

  function toggleKind(id: JobKind) {
    setKinds((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]))
  }

  function widen() {
    setRadius((r) => Math.min(RADIUS_MAX, r + 50))
  }

  const showEmpty = ready && !loadErr && !needLocation && items.length === 0
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
              {t('jobs.search')}
            </label>
            <input
              id={searchId}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('jobs.search')}
              autoComplete="off"
              className="w-full rounded-full bg-cream py-1.5 pe-3 ps-8 text-sm text-ink placeholder:text-ink-soft"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label htmlFor={radiusId} className="text-xs font-medium text-ink-soft">
              {t('jobs.range')}{' '} {formatInt(radius)} km
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
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-soft" aria-live="polite">
            {ready && !loadErr && !needLocation && resultLocation
              ? jobsWithinLine(total, resultRadius, resultLocation)
              
              : '\u00a0'}
          </p>
          <a
            
            href={VIEW_HREF.profile}
            className="text-xs font-medium text-forest underline-offset-2 hover:underline"
          >
            {t('jobs.travelProfile')}
          </a>
        </div>
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
        {!ready ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2, 3].map((i) => (
              <OpportunityCardSkeleton key={i} />
            ))}
          </ul>
        ) : loadErr && items.length === 0 ? null : needLocation ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-soft text-forest"
              aria-hidden
            >
              <MapPin size={28} />
            </div>
            <p className="mt-4 font-serif text-xl text-ink">{t('jobs.locationRequired')}</p>
            <p className="mt-1 max-w-sm text-sm text-ink-soft">
              {t('jobs.distanceMatching')}
            </p>
            {ready && !loadErr && !needLocation ? <AquaEstimate note={t('estimates.profileDistance')} /> : null}
            <a
              href={VIEW_HREF.profile}
              className="mt-4 inline-flex items-center rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
            >
              {t('common.openProfile')}
            </a>
          </div>
        ) : showEmpty ? (
          <EmptyState
            text={t('jobs.noneWithin', { distance: formatInt(radius) })}
            action={atMax
              ? { label: t('jobs.widen'), disabledReason: t('jobs.maxDistance') }
              : { label: t('jobs.widenTo', { distance: formatInt(Math.min(RADIUS_MAX, radius + 50)) }), onClick: widen }}
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map((row) => (
                <OpportunityCard key={row.id} item={row} onOpen={() => onOpen(row.id)} />
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
    </div>
  )
}
