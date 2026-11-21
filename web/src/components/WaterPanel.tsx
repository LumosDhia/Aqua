import { t } from '../i18n'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import {
  ApiError,
  api,
  canManageWater,
  canSetWaterLevel,
  type LivestockHerd,
  type LivestockSpecies,
  type WaterBalancePlot,
  type WaterSource,
  type WaterSummary,
} from '../api'
import { formatInt } from '../lib/status'
import { clearWaterTabNeeds, peekWaterTabNeeds } from '../lib/view'
import { AddPlotDialog } from './AddPlotDialog'
import { EmptyState } from './EmptyState'
import { PageFrame } from './PageFrame'
import { AddHerdDialog } from './water/AddHerdDialog'
import { AnimalsTab } from './water/AnimalsTab'
import { cubicMetresLabel, litresLabel } from './water/format'
import { NeedsTab } from './water/NeedsTab'
import { SourceCard } from './water/SourceCard'
import { SourceDialog } from './water/SourceDialog'

type WaterPanelProps = {
  farmId: number | null
  role: string
  account: { role: string }
}

type Tab = 'sources' | 'needs' | 'animals'

const TABS: Tab[] = ['sources', 'needs', 'animals']

const EMPTY_SUMMARY: WaterSummary = {
  total_stored_l: 0,
  total_capacity_l: 0,
  total_refill_l_per_day: 0,
  count: 0,
}

export function WaterPanel({ farmId, role, account }: WaterPanelProps) {
  const canManage = canManageWater(role)
  const canSetLevel = canSetWaterLevel(role)
  const [tab, setTab] = useState<Tab>('sources')
  const [sources, setSources] = useState<WaterSource[]>([])
  const [summary, setSummary] = useState<WaterSummary>(EMPTY_SUMMARY)
  const [loadErr, setLoadErr] = useState('')
  const [ready, setReady] = useState(false)
  const [tick, setTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editSource, setEditSource] = useState<WaterSource | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [herds, setHerds] = useState<LivestockHerd[]>([])
  const [species, setSpecies] = useState<LivestockSpecies[]>([])
  const [animalsReady, setAnimalsReady] = useState(false)
  const [animalsErr, setAnimalsErr] = useState('')
  const [animalsTick, setAnimalsTick] = useState(0)
  const [addHerdOpen, setAddHerdOpen] = useState(false)
  const [highlightHerdId, setHighlightHerdId] = useState<number | null>(null)
  const [editPlot, setEditPlot] = useState<WaterBalancePlot | null>(null)
  const [addPlotOpen, setAddPlotOpen] = useState(false)
  const [needsRevision, setNeedsRevision] = useState(0)
  const seqRef = useRef(0)
  const animalsSeqRef = useRef(0)
  const sourcesTabRef = useRef<HTMLButtonElement>(null)
  const needsTabRef = useRef<HTMLButtonElement>(null)
  const animalsTabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setAddOpen(false)
    setEditSource(null)
    setConfirmId(null)
    setHighlightId(null)
    setSources([])
    setSummary(EMPTY_SUMMARY)
    setLoadErr('')
    setReady(false)
    setTab('sources')
    setHerds([])
    setSpecies([])
    setAnimalsReady(false)
    setAnimalsErr('')
    setAddHerdOpen(false)
    setHighlightHerdId(null)
    setEditPlot(null)
    setAddPlotOpen(false)
  }, [farmId])

  useEffect(() => {
    if (!peekWaterTabNeeds()) return
    setTab('needs')
    const t = window.setTimeout(() => clearWaterTabNeeds(), 0)
    return () => window.clearTimeout(t)
  }, [farmId])

  useEffect(() => {
    if (highlightId == null) return
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  useEffect(() => {
    if (highlightHerdId == null) return
    const timer = window.setTimeout(() => setHighlightHerdId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightHerdId])

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      if (farmId == null) {
        if (!cancelled && my === seqRef.current) {
          setSources([])
          setSummary(EMPTY_SUMMARY)
          setReady(true)
        }
        return
      }
      try {
        const data = await api.waterSources(farmId)
        if (cancelled || my !== seqRef.current) return
        setSources(data.sources)
        setSummary(data.summary)
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        if (!isPoll) {
          setLoadErr(e instanceof ApiError ? e.message : t('water.sourceLoadError'))
        }
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 60_000)
    return () => {
      cancelled = true
      seqRef.current += 1
      window.clearInterval(timer)
    }
  }, [farmId, tick])

  useEffect(() => {
    if (tab !== 'animals') return
    let cancelled = false
    animalsSeqRef.current += 1
    const my = animalsSeqRef.current

    async function load(isPoll: boolean) {
      if (farmId == null) {
        if (!cancelled && my === animalsSeqRef.current) {
          setHerds([])
          setSpecies([])
          setAnimalsReady(true)
        }
        return
      }
      try {
        const data = await api.livestock(farmId)
        if (cancelled || my !== animalsSeqRef.current) return
        setHerds(data.herds)
        setSpecies(data.species)
        setAnimalsErr('')
      } catch (e) {
        if (cancelled || my !== animalsSeqRef.current) return
        if (!isPoll) {
          setAnimalsErr(e instanceof ApiError ? e.message : t('water.animalsLoadError'))
        }
      } finally {
        if (!cancelled && my === animalsSeqRef.current) setAnimalsReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 60_000)
    return () => {
      cancelled = true
      animalsSeqRef.current += 1
      window.clearInterval(timer)
    }
  }, [farmId, tab, animalsTick])

  function onRetry() {
    setLoadErr('')
    setReady(false)
    setTick((n) => n + 1)
  }

  function onAnimalsRetry() {
    setAnimalsErr('')
    setAnimalsReady(false)
    setAnimalsTick((n) => n + 1)
  }

  function bumpNeeds() {
    setNeedsRevision((n) => n + 1)
  }

  function upsert(source: WaterSource) {
    setSources((list) => {
      const i = list.findIndex((s) => s.id === source.id)
      if (i === -1) return [source, ...list]
      const next = list.slice()
      next[i] = source
      return next
    })
    setTick((n) => n + 1)
    bumpNeeds()
  }

  function onCreated(source: WaterSource) {
    upsert(source)
    setHighlightId(source.id)
  }

  function onRemoved(id: number) {
    setSources((list) => list.filter((s) => s.id !== id))
    setConfirmId(null)
    setTick((n) => n + 1)
    bumpNeeds()
  }

  function onHerdCreated(herd: LivestockHerd) {
    setHerds((list) => (list.some((h) => h.id === herd.id) ? list : [herd, ...list]))
    setHighlightHerdId(herd.id)
    bumpNeeds()
  }

  function selectTab(next: Tab) {
    setTab(next)
    const btn =
      next === 'sources'
        ? sourcesTabRef.current
        : next === 'needs'
          ? needsTabRef.current
          : animalsTabRef.current
    btn?.focus()
  }

  function onTabListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
      return
    }
    e.preventDefault()
    const i = TABS.indexOf(tab)
    if (e.key === 'Home') {
      selectTab('sources')
      return
    }
    if (e.key === 'End') {
      selectTab('animals')
      return
    }
    if (e.key === 'ArrowRight') {
      selectTab(TABS[(i + 1) % TABS.length] ?? 'sources')
      return
    }
    selectTab(TABS[(i - 1 + TABS.length) % TABS.length] ?? 'sources')
  }

  const shown = useMemo(
    () =>
      [...sources].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [sources],
  )

  const takenSpecies = useMemo(() => herds.map((h) => h.species), [herds])
  const remainingSpecies = species.filter((s) => !takenSpecies.includes(s.id)).length
  const addAnimalsBlocked = animalsReady && species.length > 0 && remainingSpecies === 0
  const addAnimalsTitle = addAnimalsBlocked
    ? t('water.allTypesListedPlain')
    : undefined

  const showAdd = canManage && farmId != null
  const empty = ready && sources.length === 0
  const hasLevels = sources.some((source) => source.level_recorded === true)
  const hasCapacity = sources.some((source) => source.capacity_l != null)
  const hasRefills = sources.some((source) => source.refill_recorded === true)
  const hideGrid = loadErr && sources.length === 0 && ready
  const hideAnimals = animalsErr && herds.length === 0 && animalsReady

  return (
    <PageFrame
      farmId={farmId}
      label={t('shell.water')}
      busy={tab === 'sources' ? !ready : tab === 'animals' ? !animalsReady : undefined}
      header={
        <>
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
            {t('shell.water')}
          </h2>
          {ready ? (
            <p className="text-xs text-ink-soft">
              {hasLevels ? t('water.storedRecorded', { volume: litresLabel(summary.total_stored_l) }) : t('water.storedMissing')}
              {' · '}
              {hasRefills ? t('water.refillRecorded', { volume: litresLabel(summary.total_refill_l_per_day) }) : t('water.dailyRefillMissing')}
            </p>
          ) : (
            <p className="aqua-skel mt-1 h-3 w-56 rounded" aria-hidden />
          )}
        </div>
        {showAdd && tab === 'sources' ? (
          <button
            type="button"
            onClick={() => {
              setEditSource(null)
              setAddOpen(true)
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
          >
            <Plus size={16} aria-hidden />
            {t('water.addSource')}
          </button>
        ) : null}
        {showAdd && tab === 'animals' ? (
          <span title={addAnimalsTitle} className="inline-flex shrink-0">
            <button
              type="button"
              onClick={() => setAddHerdOpen(true)}
              disabled={addAnimalsBlocked}
              title={addAnimalsTitle}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <Plus size={16} aria-hidden />
              {t('water.addAnimals')}
            </button>
          </span>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-6">
        {tab === 'sources' && loadErr ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
          >
            <p>{loadErr}</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}
        {tab === 'animals' && animalsErr ? (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
          >
            <p>{animalsErr}</p>
            <button
              type="button"
              onClick={onAnimalsRetry}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}
        <div
          role="tablist"
          aria-label={t('water.sections')}
          onKeyDown={onTabListKey}
          className="inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-sm"
        >
          <button
            type="button"
            role="tab"
            ref={sourcesTabRef}
            id="water-tab-sources"
            aria-selected={tab === 'sources'}
            aria-controls="water-panel-sources"
            tabIndex={tab === 'sources' ? 0 : -1}
            onClick={() => selectTab('sources')}
            className={`rounded-full px-4 py-1.5 ${
              tab === 'sources' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('water.myWater')}
          </button>
          <button
            type="button"
            role="tab"
            ref={needsTabRef}
            id="water-tab-needs"
            aria-selected={tab === 'needs'}
            aria-controls="water-panel-needs"
            tabIndex={tab === 'needs' ? 0 : -1}
            onClick={() => selectTab('needs')}
            className={`rounded-full px-4 py-1.5 ${
              tab === 'needs' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('water.needs')}
          </button>
          <button
            type="button"
            role="tab"
            ref={animalsTabRef}
            id="water-tab-animals"
            aria-selected={tab === 'animals'}
            aria-controls="water-panel-animals"
            tabIndex={tab === 'animals' ? 0 : -1}
            onClick={() => selectTab('animals')}
            className={`rounded-full px-4 py-1.5 ${
              tab === 'animals' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('water.animals')}
          </button>
        </div>
      </div>
        </>
      }
    >
        <div
          role="tabpanel"
          id="water-panel-sources"
          aria-labelledby="water-tab-sources"
          hidden={tab !== 'sources'}
          inert={tab !== 'sources' ? true : undefined}
        >
          {hideGrid ? null : !ready ? (
            <WaterSkeleton />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard
                  label={t('water.storageRecorded')}
                  litres={summary.total_stored_l}
                  empty={!hasLevels}
                />
                <SummaryCard
                  label={t('water.capacityRecorded')}
                  litres={summary.total_capacity_l}
                  empty={!hasCapacity}
                />
                <SummaryCard
                  label={t('water.dailyRecorded')}
                  litres={summary.total_refill_l_per_day}
                  empty={!hasRefills}
                />
              </div>

              {empty ? (
                <EmptyState
                  text={t('water.noSources')}
                  action={showAdd
                    ? { label: t('water.addSource'), onClick: () => setAddOpen(true) }
                    : { label: t('water.addSource'), disabledReason: farmId == null ? t('common.selectFarm') : t('water.addSourcesForbidden') }}
                />
              ) : farmId != null ? (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {shown.map((s) => (
                    <SourceCard
                      key={s.id}
                      farmId={farmId}
                      source={s}
                      canManage={canManage}
                      canSetLevel={canSetLevel}
                      confirm={confirmId === s.id}
                      highlight={highlightId === s.id}
                      onAskRemove={() => setConfirmId(s.id)}
                      onCancelRemove={() => setConfirmId(null)}
                      onRemoved={() => onRemoved(s.id)}
                      onChanged={upsert}
                      onEdit={() => {
                        setAddOpen(false)
                        setEditSource(s)
                      }}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          id="water-panel-needs"
          aria-labelledby="water-tab-needs"
          hidden={tab !== 'needs'}
          inert={tab !== 'needs' ? true : undefined}
        >
          <NeedsTab
            farmId={farmId}
            role={role}
            account={account}
            active={tab === 'needs'}
            revision={needsRevision}
            onAddSources={() => selectTab('sources')}
            onManageAnimals={() => selectTab('animals')}
            onEditPlot={setEditPlot}
            onAddPlot={() => setAddPlotOpen(true)}
          />
        </div>

        <div
          role="tabpanel"
          id="water-panel-animals"
          aria-labelledby="water-tab-animals"
          hidden={tab !== 'animals'}
          inert={tab !== 'animals' ? true : undefined}
        >
          {hideAnimals ? null : (
            <AnimalsTab
              farmId={farmId}
              role={role}
              herds={herds}
              loading={!animalsReady}
              highlightId={highlightHerdId}
              onAdd={showAdd && !addAnimalsBlocked ? () => setAddHerdOpen(true) : undefined}
              onHerdsChange={setHerds}
              onMutated={bumpNeeds}
            />
          )}
        </div>

      {farmId != null ? (
        <SourceDialog
          open={addOpen || editSource != null}
          farmId={farmId}
          source={editSource}
          onClose={() => {
            setAddOpen(false)
            setEditSource(null)
          }}
          onSaved={(source) => {
            if (editSource) upsert(source)
            else onCreated(source)
          }}
        />
      ) : null}

      {farmId != null ? (
        <AddPlotDialog
          open={addPlotOpen || editPlot != null}
          requireDetails
          farmId={farmId}
          plot={editPlot}
          onClose={() => {
            setEditPlot(null)
            setAddPlotOpen(false)
          }}
          onCreated={bumpNeeds}
          onUpdated={() => {
            setEditPlot(null)
            bumpNeeds()
          }}
        />
      ) : null}

      {farmId != null ? (
        <AddHerdDialog
          open={addHerdOpen}
          farmId={farmId}
          species={species}
          taken={takenSpecies}
          onClose={() => setAddHerdOpen(false)}
          onCreated={onHerdCreated}
        />
      ) : null}
    </PageFrame>
  )
}

function SummaryCard({
  label,
  litres,
  empty,
}: {
  label: string
  litres: number
  empty: boolean
}) {
  const m3 = empty ? null : cubicMetresLabel(litres)
  return (
    <article className="min-w-0 rounded-card border border-line bg-cream p-4">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-3 font-serif text-3xl leading-none text-ink">
        {empty ? t('common.notRecorded') : formatInt(litres)}
        {empty ? null : (
          <span className="ms-1.5 align-middle font-sans text-sm font-medium text-ink-soft">L</span>
        )}
      </p>
      {m3 ? <p className="mt-1 text-xs text-ink-soft">{m3}</p> : null}
    </article>
  )
}

function WaterSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-white p-4">
            <div className="aqua-skel h-3 w-20 rounded" />
            <div className="aqua-skel mt-3 h-8 w-24 rounded" />
          </div>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <li key={i} className="min-w-0 rounded-card border border-line bg-white p-3">
            <div className="flex gap-3">
              <div className="aqua-skel h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="aqua-skel h-4 w-2/3 rounded" />
                <div className="aqua-skel h-3 w-1/2 rounded" />
                <div className="aqua-skel h-2 w-full rounded-full" />
                <div className="aqua-skel h-3 w-1/3 rounded" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
