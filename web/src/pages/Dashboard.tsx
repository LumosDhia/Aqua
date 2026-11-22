import { t } from '../i18n'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Tractor } from 'lucide-react'
import {
  ApiError,
  api,
  canAddPlot,
  canEditFarm,
  isAdminUser,
  type Farm,
  type Overview,
  type Role,
  type User,
} from '../api'
import { AddPlotDialog } from '../components/AddPlotDialog'
import { ChatPanel } from '../components/ChatPanel'
import { AboutFarmDialog } from '../components/onboarding/AboutFarmDialog'
import { DashboardHome } from '../components/DashboardHome'
import type { FilterMode } from '../components/FarmMap'
import { Shell } from '../components/Shell'
import { DevicesPanel } from '../components/DevicesPanel'
import { WaterPanel } from '../components/WaterPanel'
import { WeatherPanel } from '../components/WeatherPanel'
import { MarketPanel } from '../components/MarketPanel'
import { CvPanel } from '../components/CvPanel'
import { JobsPanel } from '../components/JobsPanel'
import { MessagesPanel } from '../components/MessagesPanel'
import { MembersPanel } from '../components/MembersPanel'
import { ProfilePanel } from '../components/ProfilePanel'
import { AdminReportsPanel } from '../components/reports/AdminReportsPanel'
import { WorkersPanel } from '../components/WorkersPanel'
import { farmWorkOnly, pinnedFarmId, workspaceView } from '../lib/farmWorkspace'
import { getPreferredFarm, setPreferredFarm } from '../lib/onboarding'
import { useDashboardPoll } from '../lib/useDashboardPoll'
import { useBadges } from '../lib/useBadges'
import { useDevices } from '../lib/useDevices'
import { useUnreadMessages } from '../lib/useUnreadMessages'
import { useView } from '../lib/view'

type DashboardProps = {
  user: User
  onLogout: () => void
  onUser: (user: User) => void
  onSetupFarm: () => void
  initialFarmId?: number | null
}

export function Dashboard({
  user,
  onLogout,
  onUser,
  onSetupFarm,
  initialFarmId = null,
}: DashboardProps) {
  const { view } = useView()
  const shown = workspaceView(view, user)
  const blocked = shown !== view
  const workOnly = farmWorkOnly(user)
  const [farms, setFarms] = useState<Farm[]>([])
  const [farmId, setFarmId] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<Overview | null>(null)
  const [loadingFarms, setLoadingFarms] = useState(true)
  const [farmError, setFarmError] = useState('')
  const [overviewFailure, setOverviewFailure] = useState<{ farmId: number; message: string } | null>(null)
  const [search, setSearch] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [createdPlotId, setCreatedPlotId] = useState<number | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [aboutOpen, setAboutOpen] = useState(false)

  const refresh = useCallback(() => setRefreshKey((n) => n + 1), [])

  const loadFarms = useCallback(async () => {
    setFarmError('')
    try {
      const list = await api.farms()
      setFarms(list)
      setFarmId((prev) =>
        pinnedFarmId(list, user, prev, initialFarmId ?? getPreferredFarm(user.id)),
      )
    } catch (e) {
      setFarmError(e instanceof ApiError ? e.message : t('farm.loadFarmsError'))
    } finally {
      setLoadingFarms(false)
    }
  }, [user, initialFarmId])

  useEffect(() => {
    void loadFarms()
  }, [loadFarms, refreshKey])

  const loadOverview = useCallback(async (signal: AbortSignal) => {
    if (farmId == null) return
    try {
      const overview = await api.overview(farmId, signal)
      if (signal.aborted) return
      setSnapshot(overview)
      setOverviewFailure(null)
    } catch (e) {
      if (!signal.aborted) {
        setOverviewFailure({ farmId, message: e instanceof ApiError ? e.message : t('farm.loadFarmError') })
      }
    }
  }, [farmId])
  useDashboardPoll(loadOverview, shown === 'dashboard' ? 30_000 : 60_000, refreshKey)

  useEffect(() => {
    if (shown !== 'dashboard') setAddOpen(false)
  }, [shown])

  useEffect(() => {
    setAboutOpen(false)
    setAddOpen(false)
    setCreatedPlotId(null)
  }, [farmId])

  const overview = snapshot?.farm.id === farmId ? snapshot : null
  const overviewError = overviewFailure?.farmId === farmId ? overviewFailure.message : ''
  const error = farmError || overviewError
  const loadingOverview = farmId != null && !overview && !overviewError
  const role: Role = overview?.my_role ?? 'viewer'
  const badges = useBadges(farmId, role, refreshKey, shown, !workOnly)
  const unread = useUnreadMessages(!workOnly)
  const devices = useDevices(farmId, shown === 'dashboard')

  const plots = overview?.plots ?? []
  const farmRecord = overview?.farm ?? farms.find((f) => f.id === farmId)
  const farmName = farmRecord?.name ?? 'Aqua'
  const allowAdd = canAddPlot(role) && farmId != null

  function toggleAttention() {
    setFilterMode((mode) => mode === 'attention' ? 'all' : 'attention')
  }

  const showEmpty = !loadingFarms && farms.length === 0 && !error

  const farmAbout = farms.find((f) => f.id === farmId)
  const owner = canEditFarm(role)
  const showAbout =
    farmId != null &&
    !showEmpty &&
    (owner || Boolean(farmAbout?.region) || farmAbout?.area_m2 != null || Boolean(farmAbout?.description.trim()) || Boolean(farmAbout?.has_sketch))

  let main: ReactNode
  if (shown === 'chat') {
    main = (
      <ChatPanel
        farmId={farmId}
        farmName={farmName}
        role={role}
        plots={plots}
        loading={overview == null && (loadingFarms || loadingOverview)}
      />
    )
  } else if (shown === 'workers') {
    main = (
      <WorkersPanel farmId={farmId} role={role} plots={plots} />
    )
  } else if (shown === 'water') {
    main = <WaterPanel farmId={farmId} role={role} account={user} />
  } else if (shown === 'devices') {
    main = <DevicesPanel farmId={farmId} role={role} plots={plots} />
  } else if (shown === 'weather') {
    main = <WeatherPanel farmId={farmId} />
  } else if (shown === 'members') {
    main = (
      <MembersPanel
        farmId={farmId}
        role={role}
        onSeeFarm={(id) => {
          setPreferredFarm(user.id, id)
          setFarmId(id)
          window.location.hash = '#/'
        }}
      />
    )
  } else if (shown === 'market') {
    main = (
      <MarketPanel
        farmId={farmId}
        role={role}
        farmLat={farmRecord?.lat ?? null}
        farmLon={farmRecord?.lon ?? null}
        farmRegion={farmRecord?.region ?? ''}
      />
    )
  } else if (shown === 'jobs') {
    main = (
      <JobsPanel farmId={farmId} role={role} farmRegion={farmRecord?.region ?? ''} />
    )
  } else if (shown === 'messages') {
    main = <MessagesPanel side="farm" onUnreadChange={unread.refresh} />
  } else if (shown === 'profile') {
    main = <ProfilePanel />
  } else if (shown === 'cv') {
    main = <CvPanel />
  } else if (shown === 'admin') {
    main = <AdminReportsPanel allowed={isAdminUser(user)} />
  } else {
    main = (
      <div className="flex h-full min-h-0 flex-col">
        {blocked ? (
          <p role="status" className="mb-3 shrink-0 rounded-card bg-cream px-4 py-2 text-sm text-ink">
            {t('farm.restrictedWorkspace')}
          </p>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
          >
            <p>{error}</p>
            <button
              type="button"
              onClick={() => {
                if (farmError && !overview) setLoadingFarms(true)
                refresh()
              }}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain lg:overflow-hidden">
          {loadingFarms ? (
            <DashSkeleton />
          ) : showEmpty ? (
            <EmptyFarm onSetup={onSetupFarm} />
          ) : loadingOverview && !overview ? (
            <DashSkeleton />
          ) : overview && farmId != null ? (
            <DashboardHome
              key={farmId}
              farmId={farmId}
              overview={overview}
              refreshKey={refreshKey}
              onRefresh={refresh}
              search={search}
              filterMode={filterMode}
              onToggleAttention={toggleAttention}
              devices={devices}
              onAddPlot={allowAdd ? () => setAddOpen(true) : undefined}
              createdPlotId={createdPlotId}
              user={user}
            />
          ) : null}
        </div>

        {farmId != null ? (
          <AddPlotDialog
            open={addOpen}
            farmId={farmId}
            onClose={() => setAddOpen(false)}
            onCreated={(plot) => { setCreatedPlotId(plot.id); refresh() }}
          />
        ) : null}
      </div>
    )
  }

  return (
    <Shell
      farmName={showEmpty ? 'Aqua' : farmName}
      farmId={farmId}
      roleKnown={overview != null || Boolean(overviewError) || showEmpty}
      attentionOn={filterMode === 'attention'}
      onToggleAttention={toggleAttention}
      search={search}
      onSearch={setSearch}
      user={user}
      role={role}
      onLogout={onLogout}
      onUser={onUser}
      marketBadge={badges.newInquiries}
      jobsBadge={badges.pendingApplications}
      messagesBadge={unread.total}
      onAbout={showAbout ? () => setAboutOpen(true) : undefined}
    >
      {main}
      {farmId != null && showAbout ? (
        <AboutFarmDialog
          open={aboutOpen}
          farmId={farmId}
          description={farmAbout?.description ?? ''}
          governorate={farmAbout?.region ?? ''}
          areaM2={farmAbout?.area_m2 ?? null}
          hasSketch={Boolean(farmAbout?.has_sketch)}
          canEdit={owner}
          onClose={() => setAboutOpen(false)}
          onUpdated={(next) => {
            setFarms((list) =>
              list.map((f) =>
                f.id === farmId
                  ? { ...f, description: next.description, has_sketch: next.has_sketch }
                  : f,
              ),
            )
          }}
        />
      ) : null}
    </Shell>
  )
}

function EmptyFarm({ onSetup }: { onSetup: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-4 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-soft text-forest"
        aria-hidden
      >
        <Tractor size={28} />
      </div>
      <p className="mt-4 font-serif text-xl text-ink">{t('farm.none')}</p>
      <p className="mt-1 max-w-sm text-sm text-ink-soft">
        {t('farm.setupHelp')}
      </p>
      <button
        type="button"
        onClick={onSetup}
        className="mt-4 rounded-full bg-forest-deep px-5 py-2.5 text-sm font-medium text-white"
      >
        {t('farm.setup')}
      </button>
    </div>
  )
}

function DashSkeleton() {
  return (
    <div className="grid h-full min-h-0 gap-2 lg:grid-cols-2" aria-hidden>
      <div className="aqua-skel h-10 rounded-full" />
      <div className="aqua-skel h-10 rounded-full" />
      <div className="aqua-skel h-20 rounded-card" />
      <div className="aqua-skel h-20 rounded-card" />
      <div className="aqua-skel h-28 rounded-card" />
      <div className="aqua-skel h-28 rounded-card" />
      <div className="aqua-skel col-span-full h-20 rounded-card" />
    </div>
  )
}
