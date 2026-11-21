import { t } from '../i18n'
import { useEffect, useState } from 'react'
import type { Overview, User } from '../api'
import { useDashboardResources } from '../lib/useDashboardResources'
import type { useDevices } from '../lib/useDevices'
import { DashboardAnimals } from './DashboardAnimals'
import { DashboardLog } from './DashboardLog'
import { DashboardMain } from './DashboardMain'
import { DashboardPlants } from './DashboardPlants'
import { DashboardSide, dashboardPanelFromHash, readDashboardTab, rememberDashboardTab, type DashboardTab } from './DashboardSide'
import { DashboardSoil } from './DashboardSoil'
import { FarmControlsCard } from './FarmControlsCard'
import { FarmMap, type FilterMode } from './FarmMap'

type DashboardHomeProps = {
  farmId: number
  overview: Overview
  refreshKey: number
  onRefresh: () => void
  search: string
  filterMode: FilterMode
  onToggleAttention: () => void
  devices: ReturnType<typeof useDevices>
  onAddPlot?: () => void
  createdPlotId: number | null
  user: User
}

export function DashboardHome({
  farmId, overview, refreshKey, onRefresh, search, filterMode,
  onToggleAttention, devices, onAddPlot, createdPlotId, user,
}: DashboardHomeProps) {
  const [tab, setTab] = useState(() => dashboardPanelFromHash() ?? readDashboardTab())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { plots, my_role: role } = overview
  const { forecast, water, history } = useDashboardResources(farmId, plots, refreshKey)
  const failed = [
    forecast.failed ? 'weather' : '',
    water.failed ? t('dashboard.storageMetric') : '',
    history.failed ? t('dashboard.historyMetric') : '',
  ].filter(Boolean)

  function changeTab(next: DashboardTab) {
    setTab(next)
    setSelectedId(null)
    rememberDashboardTab(next)
  }

  function openPlot(id: number) {
    setTab('map')
    rememberDashboardTab('map')
    setSelectedId(id)
  }

  useEffect(() => {
    function applyPanel() {
      const next = dashboardPanelFromHash()
      if (!next) return
      setTab(next)
      rememberDashboardTab(next)
    }
    applyPanel()
    window.addEventListener('hashchange', applyPanel)
    return () => window.removeEventListener('hashchange', applyPanel)
  }, [])

  useEffect(() => {
    if (createdPlotId != null) {
      setTab('map')
      setSelectedId(createdPlotId)
      rememberDashboardTab('map')
    }
  }, [createdPlotId])

  return (
    <div className="grid min-h-0 min-w-0 gap-3 lg:h-full lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-[minmax(0,1fr)]">
      <DashboardMain
        overview={overview}
        water={water.data}
        forecast={forecast.data}
        history={history.data}
        historyFailed={history.failed}
        waterLoading={!water.data && !water.failed}
        weatherLoading={!forecast.data && !forecast.failed}
        contextError={failed.length ? t('dashboard.refreshMetricError', { metric: failed.join(', ') }) : ''}
        emptyDevices={!devices.loading && !devices.error && devices.devices.length === 0}
        controls={devices.error ? (
          <p role="alert" className="flex shrink-0 flex-wrap justify-between gap-1 text-xs text-hanko">
            {devices.error} <button type="button" onClick={devices.refresh} className="font-medium underline">{t('common.retry')}</button>
          </p>
        ) : devices.devices.length > 0 ? (
          <FarmControlsCard
            farmId={farmId}
            role={role}
            devices={devices.devices}
            setDevices={devices.setDevices}
            onSettled={devices.refresh}
          />
        ) : null}
        search={search}
        attentionOnly={filterMode === 'attention'}
        onAttention={onToggleAttention}
        onSelect={openPlot}
        onAdd={onAddPlot}
        onRefresh={onRefresh}
      />
      <DashboardSide active={tab} onChange={changeTab}>
        {tab === 'map' ? (
          <FarmMap
            plots={plots}
            role={role}
            selectedId={selectedId}
            onSelect={setSelectedId}
            search={search}
            filterMode={filterMode}
            onAddPlot={onAddPlot}
            onRefresh={onRefresh}
            farmId={farmId}
            devices={devices.devices}
            onDevicesRefresh={devices.refresh}
            waterSources={water.data?.sources ?? []}
          />
        ) : tab === 'plants' ? (
          <DashboardPlants plots={plots} onSelect={openPlot} />
        ) : tab === 'animals' ? (
          <DashboardAnimals farmId={farmId} role={role} onMutated={onRefresh} />
        ) : tab === 'soil' ? (
          <DashboardSoil farmId={farmId} role={role} />
        ) : (
          <DashboardLog farmId={farmId} role={role} user={user} plots={plots} />
        )}
      </DashboardSide>
    </div>
  )
}
