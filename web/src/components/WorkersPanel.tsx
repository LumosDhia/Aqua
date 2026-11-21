import { t } from '../i18n'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { UserPlus } from 'lucide-react'
import {
  ApiError,
  api,
  canManageWorkers,
  type Task,
  type Worker,
  type WorkerPlot,
} from '../api'
import { PageFrame } from './PageFrame'
import { AddWorkerDialog } from './workers/AddWorkerDialog'
import { FindWorkersTab } from './workers/FindWorkersTab'
import { HiredWorkersTab } from './workers/HiredWorkersTab'
import { TasksTab } from './workers/TasksTab'
import { TeamTab } from './workers/TeamTab'

type WorkersPanelProps = {
  farmId: number | null
  role: string
  plots: WorkerPlot[]
}

type Tab = 'workers' | 'tasks' | 'hired' | 'find'

function teamSummary(workers: Worker[]): string {
  const n = workers.length
  const noun = n === 1 ? 'worker' : 'workers'
  return `${n} ${noun}`
}

export function WorkersPanel({ farmId, role, plots }: WorkersPanelProps) {
  const canManage = canManageWorkers(role)
  const [tab, setTab] = useState<Tab>('workers')
  const [workers, setWorkers] = useState<Worker[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [ready, setReady] = useState(false)
  const [tick, setTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [taskTarget, setTaskTarget] = useState<{ id: number; seq: number } | null>(null)
  const activeFarm = useRef(farmId)
  const seqRef = useRef(0)
  const workersRevision = useRef(0)
  const tasksRevision = useRef(0)
  const workersTabRef = useRef<HTMLButtonElement>(null)
  const tasksTabRef = useRef<HTMLButtonElement>(null)
  const hiredTabRef = useRef<HTMLButtonElement>(null)
  const findTabRef = useRef<HTMLButtonElement>(null)
  const tabs: Tab[] = canManage
    ? ['workers', 'tasks', 'hired', 'find']
    : ['workers', 'tasks']

  useEffect(() => {
    activeFarm.current = farmId
    setAddOpen(false)
    setHighlightId(null)
    setTaskTarget(null)
    setTab('workers')
    setWorkers([])
    setTasks([])
    setLoadErr('')
    setReady(false)
  }, [farmId])

  useEffect(() => {
    if (highlightId == null) return
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      const workerVersion = workersRevision.current
      const taskVersion = tasksRevision.current
      const wP = farmId != null ? api.workers(farmId) : Promise.resolve([] as Worker[])
      const tP = farmId != null ? api.tasks(farmId) : Promise.resolve([] as Task[])
      const [wR, tR] = await Promise.allSettled([wP, tP])
      if (cancelled || my !== seqRef.current) return
      if (wR.status === 'fulfilled' && workersRevision.current === workerVersion) setWorkers(wR.value)
      if (tR.status === 'fulfilled' && tasksRevision.current === taskVersion) setTasks(tR.value)
      const dataFail = [wR, tR].find((r) => r.status === 'rejected')
      if (dataFail && dataFail.status === 'rejected' && !isPoll) {
        const reason = dataFail.reason
        setLoadErr(reason instanceof ApiError ? reason.message : t('workers.loadError'))
      } else if (!dataFail) {
        setLoadErr('')
      }
      setReady(true)
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
  }, [farmId, tick])

  function selectTab(next: Tab) {
    setTab(next)
    const btn =
      next === 'workers'
        ? workersTabRef.current
        : next === 'tasks'
          ? tasksTabRef.current
          : next === 'hired'
            ? hiredTabRef.current
            : findTabRef.current
    btn?.focus()
  }

  function onTabListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') {
      return
    }
    e.preventDefault()
    const i = Math.max(0, tabs.indexOf(tab))
    if (e.key === 'Home') {
      selectTab(tabs[0] ?? 'workers')
      return
    }
    if (e.key === 'End') {
      selectTab(tabs[tabs.length - 1] ?? 'workers')
      return
    }
    if (e.key === 'ArrowRight') {
      selectTab(tabs[(i + 1) % tabs.length] ?? 'workers')
      return
    }
    selectTab(tabs[(i - 1 + tabs.length) % tabs.length] ?? 'workers')
  }

  function onWorkersChange(update: (list: Worker[]) => Worker[]) {
    if (activeFarm.current !== farmId) return
    workersRevision.current += 1
    setWorkers(update)
  }

  function onTasksChange(update: (list: Task[]) => Task[]) {
    if (activeFarm.current !== farmId) return
    tasksRevision.current += 1
    setTasks(update)
  }

  function onCreated(worker: Worker) {
    if (activeFarm.current !== farmId) return
    onWorkersChange((list) => (list.some((w) => w.id === worker.id) ? list : [worker, ...list]))
    setHighlightId(worker.id)
    setTab('workers')
  }

  function onSendTask(worker: Worker) {
    setTaskTarget((prev) => ({ id: worker.id, seq: (prev?.seq ?? 0) + 1 }))
    selectTab('tasks')
  }

  function onRetry() {
    setLoadErr('')
    setReady(false)
    setTick((n) => n + 1)
  }

  const showAdd = canManage && farmId != null

  return (
    <PageFrame
      farmId={farmId}
      label={t('shell.workers')}
      busy={!ready}
      body="contain"
      header={
        <>
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2
            tabIndex={-1}
            className="font-serif text-lg leading-tight text-ink sm:text-xl"
          >
            {t('workers.title')}
          </h2>
          {ready ? (
            <p className="text-xs text-ink-soft">{teamSummary(workers)}</p>
          ) : (
            <p className="aqua-skel mt-1 h-3 w-44 rounded" aria-hidden />
          )}
        </div>
        {showAdd ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
          >
            <UserPlus size={16} aria-hidden />
            {t('workers.add')}
          </button>
        ) : null}
      </header>

      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-6">
        {loadErr ? (
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
        <div
          role="tablist"
          aria-label={t('workers.sections')}
          onKeyDown={onTabListKey}
          className="inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
        >
          <button
            type="button"
            role="tab"
            ref={workersTabRef}
            id="workers-tab-workers"
            aria-selected={tab === 'workers'}
            aria-controls="workers-panel-workers"
            tabIndex={tab === 'workers' ? 0 : -1}
            onClick={() => selectTab('workers')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'workers' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('workers.title')}
          </button>
          <button
            type="button"
            role="tab"
            ref={tasksTabRef}
            id="workers-tab-tasks"
            aria-selected={tab === 'tasks'}
            aria-controls="workers-panel-tasks"
            tabIndex={tab === 'tasks' ? 0 : -1}
            onClick={() => selectTab('tasks')}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              tab === 'tasks' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('workers.tasks')}
          </button>
          {canManage ? (
            <button
              type="button"
              role="tab"
              ref={hiredTabRef}
              id="workers-tab-hired"
              aria-selected={tab === 'hired'}
              aria-controls="workers-panel-hired"
              tabIndex={tab === 'hired' ? 0 : -1}
              onClick={() => selectTab('hired')}
              className={`rounded-full px-3 py-1.5 sm:px-4 ${
                tab === 'hired' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
              }`}
            >
              {t('workers.hired')}
            </button>
          ) : null}
          {canManage ? (
            <button
              type="button"
              role="tab"
              ref={findTabRef}
              id="workers-tab-find"
              aria-selected={tab === 'find'}
              aria-controls="workers-panel-find"
              tabIndex={tab === 'find' ? 0 : -1}
              onClick={() => selectTab('find')}
              className={`rounded-full px-3 py-1.5 sm:px-4 ${
                tab === 'find' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
              }`}
            >
              {t('workers.find')}
            </button>
          ) : null}
        </div>
      </div>
        </>
      }
    >
        <div
          role="tabpanel"
          id="workers-panel-workers"
          aria-labelledby="workers-tab-workers"
          hidden={tab !== 'workers'}
          inert={tab !== 'workers' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="page-scroll min-h-0 flex-1">
          {loadErr && workers.length === 0 && ready ? null : (
            <TeamTab
              key={farmId ?? 'none'}
              farmId={farmId}
              role={role}
              workers={workers}
              tasks={tasks}
              loading={!ready}
              highlightId={highlightId}
              onWorkersChange={onWorkersChange}
              onAddWorker={showAdd ? () => setAddOpen(true) : undefined}
              onSendTask={onSendTask}
            />
          )}
          </div>
        </div>
        <div
          role="tabpanel"
          id="workers-panel-tasks"
          aria-labelledby="workers-tab-tasks"
          hidden={tab !== 'tasks'}
          inert={tab !== 'tasks' ? true : undefined}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="page-scroll min-h-0 flex-1">
          <TasksTab
            key={farmId ?? 'none'}
            farmId={farmId}
            role={role}
            workers={workers}
            plots={plots}
            tasks={tasks}
            onTasksChange={onTasksChange}
            preselectWorkerId={taskTarget?.id ?? null}
            preselectSeq={taskTarget?.seq ?? 0}
            onOpenWorkers={() => selectTab('workers')}
          />
          </div>
        </div>
        {canManage ? (
          <div
            role="tabpanel"
            id="workers-panel-hired"
            aria-labelledby="workers-tab-hired"
            hidden={tab !== 'hired'}
            inert={tab !== 'hired' ? true : undefined}
            className="flex h-full min-h-0 flex-col"
          >
            <HiredWorkersTab key={farmId ?? 'none'} farmId={farmId} role={role} />
          </div>
        ) : null}
        {canManage ? (
          <div
            role="tabpanel"
            id="workers-panel-find"
            aria-labelledby="workers-tab-find"
            hidden={tab !== 'find'}
            inert={tab !== 'find' ? true : undefined}
            className="flex h-full min-h-0 flex-col"
          >
            <FindWorkersTab key={farmId ?? 'none'} farmId={farmId} />
          </div>
        ) : null}

      {farmId != null ? (
        <AddWorkerDialog
          open={addOpen}
          farmId={farmId}
          onClose={() => setAddOpen(false)}
          onCreated={onCreated}
        />
      ) : null}
    </PageFrame>
  )
}
