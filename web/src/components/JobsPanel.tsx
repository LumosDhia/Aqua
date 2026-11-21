import { t, countLabel } from '../i18n'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import {
  ApiError,
  api,
  canManageJobs,
  type Job,
  type JobKind,
  type MarketMeta,
  type MyProfile,
} from '../api'
import { formatInt } from '../lib/status'
import { VIEW_HREF, jobsHref, peekJobsTab, type JobsTab } from '../lib/view'
import { PageFrame } from './PageFrame'
import { FindWorkTab } from './jobs/FindWorkTab'
import { isJobKind } from './jobs/format'
import { JobDetailDialog } from './jobs/JobDetailDialog'
import { JobFormDialog } from './jobs/JobFormDialog'
import { MyApplicationsTab } from './jobs/MyApplicationsTab'
import { MyPostsTab } from './jobs/MyPostsTab'
import { MyWorkTab } from './jobs/MyWorkTab'
import { OpportunitiesTab } from './jobs/OpportunitiesTab'

type JobsPanelProps = {
  farmId: number | null
  role: string
  farmRegion: string
  workerMode?: boolean
}

type Tab = JobsTab

const FARM_TABS: Tab[] = ['browse', 'mine', 'sent', 'work']
const WORKER_TABS: Tab[] = ['browse', 'sent', 'work']

export function JobsPanel({ farmId, role, farmRegion, workerMode = false }: JobsPanelProps) {
  const canManage = canManageJobs(role)
  const tabs = workerMode ? WORKER_TABS : FARM_TABS
  const [tab, setTab] = useState<Tab>(() => {
    const fromHash = peekJobsTab()
    if (fromHash && (workerMode ? WORKER_TABS : FARM_TABS).includes(fromHash)) return fromHash
    return 'browse'
  })
  const [meta, setMeta] = useState<MarketMeta | null>(null)
  const [mine, setMine] = useState<Job[]>([])
  const [mineReady, setMineReady] = useState(false)
  const [mineErr, setMineErr] = useState('')
  const [mineTick, setMineTick] = useState(0)
  const [browseTick, setBrowseTick] = useState(0)
  const [sentTick, setSentTick] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editJob, setEditJob] = useState<Job | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const seqRef = useRef(0)
  const browseTabRef = useRef<HTMLButtonElement>(null)
  const mineTabRef = useRef<HTMLButtonElement>(null)
  const sentTabRef = useRef<HTMLButtonElement>(null)
  const workTabRef = useRef<HTMLButtonElement>(null)

  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [profileReady, setProfileReady] = useState(false)
  const [near, setNear] = useState<'me' | 'farm'>('me')

  const showAdd = canManage && farmId != null && !workerMode
  const addTitle = workerMode
    ? undefined
    : !canManage
      ? t('jobs.postForbidden')
      : farmId == null
        ? t('jobs.joinToPost')
        : undefined
  const hasFarm = farmId != null && !workerMode
  const hasLocation = Boolean(profile?.governorate)
  const useOpportunities = workerMode || (hasLocation && (!hasFarm || near === 'me'))
  const profilePrivate = profile?.visibility === 'private'
  const initialKinds: JobKind[] = (profile?.kinds ?? []).filter(isJobKind)
  const initialSkills = profile?.skills ?? []
  const initialRadius = Math.min(300, Math.max(5, profile?.radius_km ?? 50))

  useEffect(() => {
    function onHash() {
      const fromHash = peekJobsTab()
      const allowed = workerMode ? WORKER_TABS : FARM_TABS
      if (fromHash && allowed.includes(fromHash)) setTab(fromHash)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [workerMode])

  useEffect(() => {
    setFormOpen(false)
    setEditJob(null)
    setDetailId(null)
    setHighlightId(null)
    const fromHash = peekJobsTab()
    const allowed = workerMode ? WORKER_TABS : FARM_TABS
    setTab(fromHash && allowed.includes(fromHash) ? fromHash : 'browse')
    setMine([])
    setMineReady(false)
    setMineErr('')
    setNear('me')
  }, [farmId, workerMode])

  useEffect(() => {
    let cancelled = false
    setProfileReady(false)
    api
      .profileMe()
      .then((p) => {
        if (cancelled) return
        setProfile(p)
      })
      .catch(() => {
        if (cancelled) return
        setProfile(null)
      })
      .finally(() => {
        if (!cancelled) setProfileReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (highlightId == null) return
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  useEffect(() => {
    let cancelled = false
    api
      .marketMeta()
      .then((m) => {
        if (cancelled) return
        setMeta(m)
      })
      .catch(() => {
        if (cancelled) return
        setMeta((prev) => prev ?? { governorates: [], sources: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      if (farmId == null) {
        if (!cancelled && my === seqRef.current) {
          setMine([])
          setMineReady(true)
          setMineErr('')
        }
        return
      }
      try {
        const rows = await api.farmJobs(farmId)
        if (cancelled || my !== seqRef.current) return
        setMine(rows)
        setMineErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        if (!isPoll) {
          setMineErr(e instanceof ApiError ? e.message : t('jobs.loadPostsError'))
        }
      } finally {
        if (!cancelled && my === seqRef.current) setMineReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 30_000)
    return () => {
      cancelled = true
      seqRef.current += 1
      window.clearInterval(timer)
    }
  }, [farmId, mineTick])

  function selectTab(next: Tab) {
    setTab(next)
    const href = jobsHref(next)
    if (window.location.hash !== href) window.location.hash = href
    const btn =
      next === 'browse'
        ? browseTabRef.current
        : next === 'mine'
          ? mineTabRef.current
          : next === 'work'
            ? workTabRef.current
            : sentTabRef.current
    btn?.focus()
  }

  function onTabListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
      return
    }
    e.preventDefault()
    const i = Math.max(0, tabs.indexOf(tab))
    if (e.key === 'Home') {
      selectTab(tabs[0] ?? 'browse')
      return
    }
    if (e.key === 'End') {
      selectTab(tabs[tabs.length - 1] ?? 'browse')
      return
    }
    if (e.key === 'ArrowRight') {
      selectTab(tabs[(i + 1) % tabs.length] ?? 'browse')
      return
    }
    selectTab(tabs[(i - 1 + tabs.length) % tabs.length] ?? 'browse')
  }

  function openCreate() {
    setEditJob(null)
    setFormOpen(true)
  }

  function onSaved(job: Job) {
    setMine((list) => {
      const i = list.findIndex((j) => j.id === job.id)
      if (i === -1) return [job, ...list]
      const next = list.slice()
      next[i] = job
      return next
    })
    setHighlightId(job.id)
    setBrowseTick((n) => n + 1)
    if (!editJob) selectTab('mine')
  }

  const pendingN = mine.reduce((s, j) => s + (j.pending_applications ?? 0), 0)

  return (
    <PageFrame
      farmId={farmId}
      demonstration={profile?.demo}
      label={t('shell.jobs')}
      body="contain"
      busy={tab === 'mine' ? !mineReady : undefined}
      header={
        <>
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
            {t('shell.jobs')}
          </h2>
          <p className="text-xs text-ink-soft">{t('jobs.subtitle')}</p>
        </div>
        {workerMode ? null : showAdd ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} aria-hidden />
            {t('jobs.post')}
          </button>
        ) : (
          <span title={addTitle} className="inline-flex shrink-0">
            <button
              type="button"
              disabled
              title={addTitle}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <Plus size={16} aria-hidden />
              {t('jobs.post')}
            </button>
          </span>
        )}
      </header>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-6">
        {profilePrivate ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ochre/40 bg-ochre-soft/40 px-4 py-3 text-sm text-ink"
          >
            <p>{t('jobs.privateBrowse')}</p>
            <a
              href={VIEW_HREF.profile}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('common.openProfile')}
            </a>
          </div>
        ) : null}
        <div
          role="tablist"
          aria-label={t('jobs.sections')}
          onKeyDown={onTabListKey}
          className="inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
        >
          <button
            type="button"
            role="tab"
            ref={browseTabRef}
            id="jobs-tab-browse"
            aria-selected={tab === 'browse'}
            aria-controls="jobs-panel-browse"
            tabIndex={tab === 'browse' ? 0 : -1}
            onClick={() => selectTab('browse')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'browse' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('jobs.opportunities')}
          </button>
          {workerMode ? null : (
          <button
            type="button"
            role="tab"
            ref={mineTabRef}
            id="jobs-tab-mine"
            aria-selected={tab === 'mine'}
            aria-controls="jobs-panel-mine"
            aria-label={
              pendingN > 0
                ? t('messages.withUnread', { label: t('jobs.myPosts'), unread: countLabel('jobs.pendingApplications', pendingN) })
                : t('jobs.myPosts')
            }
            tabIndex={tab === 'mine' ? 0 : -1}
            onClick={() => selectTab('mine')}
            className={`inline-flex items-center rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'mine' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('jobs.myPosts')}
            {pendingN > 0 ? (
              <span className="ms-1 min-w-4 rounded-full bg-hanko px-1 text-center text-[10px] leading-4 text-white">
                {pendingN > 99 ? '99+' : formatInt(pendingN)}
              </span>
            ) : null}
          </button>
          )}
          <button
            type="button"
            role="tab"
            ref={sentTabRef}
            id="jobs-tab-sent"
            aria-selected={tab === 'sent'}
            aria-controls="jobs-panel-sent"
            tabIndex={tab === 'sent' ? 0 : -1}
            onClick={() => selectTab('sent')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'sent' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('jobs.myApplications')}
          </button>
          <button
            type="button"
            role="tab"
            ref={workTabRef}
            id="jobs-tab-work"
            aria-selected={tab === 'work'}
            aria-controls="jobs-panel-work"
            tabIndex={tab === 'work' ? 0 : -1}
            onClick={() => selectTab('work')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'work' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('jobs.myWork')}
          </button>
        </div>
      </div>
        </>
      }
    >
        <div
          role="tabpanel"
          id="jobs-panel-browse"
          aria-labelledby="jobs-tab-browse"
          hidden={tab !== 'browse'}
          inert={tab !== 'browse' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          {hasFarm && hasLocation && tab === 'browse' ? (
            <div
              role="group"
              aria-label={t('jobs.where')}
              className="mb-2 inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
            >
              <button
                type="button"
                aria-pressed={near === 'me'}
                onClick={() => setNear('me')}
                className={`rounded-full px-3 py-1.5 ${
                  near === 'me' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
                }`}
              >
                {t('jobs.nearMe')}
              </button>
              <button
                type="button"
                aria-pressed={near === 'farm'}
                onClick={() => setNear('farm')}
                className={`rounded-full px-3 py-1.5 ${
                  near === 'farm' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
                }`}
              >
                {t('jobs.nearFarm')}
              </button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1">
          {useOpportunities ? (
            profileReady ? (
              <OpportunitiesTab
                key={profile?.user_id ?? 'anon'}
                location={profile?.governorate ?? ''}
                initialRadius={initialRadius}
                initialKinds={initialKinds}
                initialSkills={initialSkills}
                tick={browseTick}
                onOpen={setDetailId}
              />
            ) : (
              <div className="flex h-full min-h-0 flex-col gap-2" aria-hidden>
                <div className="aqua-skel h-8 w-full rounded-full" />
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="aqua-skel h-24 rounded-card" />
                  <div className="aqua-skel h-24 rounded-card" />
                </div>
              </div>
            )
          ) : (
            <FindWorkTab
              farmId={farmId}
              meta={meta}
              tick={browseTick}
              canPost={showAdd}
              workerMode={workerMode}
              onOpen={setDetailId}
              onPostJob={showAdd ? openCreate : undefined}
            />
          )}
          </div>
        </div>
        {workerMode ? null : (
        <div
          role="tabpanel"
          id="jobs-panel-mine"
          aria-labelledby="jobs-tab-mine"
          hidden={tab !== 'mine'}
          inert={tab !== 'mine' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <MyPostsTab
            farmId={farmId}
            role={role}
            jobs={mine}
            loading={!mineReady}
            loadErr={mineErr}
            highlightId={highlightId}
            onRetry={() => {
              setMineErr('')
              setMineReady(false)
              setMineTick((n) => n + 1)
            }}
            onJobsChange={setMine}
            onRefresh={() => {
              setMineTick((n) => n + 1)
              setBrowseTick((n) => n + 1)
            }}
            onPostJob={showAdd ? openCreate : undefined}
            onEdit={(job) => {
              setEditJob(job)
              setFormOpen(true)
            }}
          />
        </div>
        )}
        <div
          role="tabpanel"
          id="jobs-panel-sent"
          aria-labelledby="jobs-tab-sent"
          hidden={tab !== 'sent'}
          inert={tab !== 'sent' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <MyApplicationsTab tick={sentTick} />
        </div>
        <div
          role="tabpanel"
          id="jobs-panel-work"
          aria-labelledby="jobs-tab-work"
          hidden={tab !== 'work'}
          inert={tab !== 'work' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <MyWorkTab onGoOpportunities={() => selectTab('browse')} />
        </div>

      <JobDetailDialog
        open={detailId != null}
        jobId={detailId}
        farmId={farmId}
        meta={meta}
        profilePrivate={profilePrivate}
        onClose={() => setDetailId(null)}
        onApplied={() => setSentTick((n) => n + 1)}
        onWithdrawn={() => setSentTick((n) => n + 1)}
      />
      {farmId != null ? (
        <JobFormDialog
          open={formOpen}
          farmId={farmId}
          job={editJob}
          meta={meta}
          farmRegion={farmRegion}
          onClose={() => {
            setFormOpen(false)
            setEditJob(null)
          }}
          onSaved={onSaved}
        />
      ) : null}
    </PageFrame>
  )
}
