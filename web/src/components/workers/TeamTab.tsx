import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useMemo, useState } from 'react'
import { Search, Send, Trash2 } from 'lucide-react'
import {
  ApiError,
  api,
  canAssignTasks,
  canManageWorkers,
  type Task,
  type Worker,
} from '../../api'
import { formatInt, formatRelative } from '../../lib/status'
import { Portrait } from '../Portrait'

type SortMode = 'name' | 'active'

type WorkerStats = {
  open: number
  done: number
  latest: string | null
}

const EMPTY_STATS: WorkerStats = { open: 0, done: 0, latest: null }

function statsByWorker(tasks: Task[]): Map<number, WorkerStats> {
  const map = new Map<number, WorkerStats>()
  for (const t of tasks) {
    let row = map.get(t.worker_id)
    if (!row) {
      row = { open: 0, done: 0, latest: null }
      map.set(t.worker_id, row)
    }
    if (t.status === 'pending') row.open += 1
    else if (t.status === 'done') row.done += 1
    if (!row.latest || t.created_at > row.latest) row.latest = t.created_at
  }
  return map
}

function openDoneLine(open: number, done: number): string {
  const taskWord = open === 1 ? 'task' : 'tasks'
  return `${formatInt(open)} open ${taskWord}, ${formatInt(done)} done`
}

function lastTaskLabel(iso: string | null): string {
  if (!iso) return t('workers.noTasksCaption')
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return t('workers.noTasksCaption')
  return t('workers.lastTask', { time: formatRelative(iso) })
}

function latestMs(iso: string | null): number {
  if (!iso) return 0
  const n = Date.parse(iso)
  return Number.isNaN(n) ? 0 : n
}

export function TeamTab({
  farmId,
  role,
  workers,
  tasks,
  loading,
  highlightId,
  onWorkersChange,
  onAddWorker,
  onSendTask,
}: {
  farmId: number | null
  role: string
  workers: Worker[]
  tasks: Task[]
  loading: boolean
  highlightId: number | null
  onWorkersChange: (update: (prev: Worker[]) => Worker[]) => void
  onAddWorker?: () => void
  onSendTask?: (worker: Worker) => void
}) {
  const canManage = canManageWorkers(role)
  const canAssign = canAssignTasks(role)
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('name')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [removeErr, setRemoveErr] = useState('')

  const statsMap = useMemo(() => statsByWorker(tasks), [tasks])

  useEffect(() => {
    if (highlightId != null) setQuery('')
  }, [highlightId])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? workers.filter(
          (w) =>
            w.name.toLowerCase().includes(q) || w.role_label.toLowerCase().includes(q),
        )
      : workers.slice()
    filtered.sort((a, b) => {
      if (sort === 'active') {
        const diff = latestMs(statsMap.get(b.id)?.latest ?? null) - latestMs(statsMap.get(a.id)?.latest ?? null)
        if (diff !== 0) return diff
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    if (highlightId == null) return filtered
    // Keep a just-created worker first while its highlight is on.
    const i = filtered.findIndex((w) => w.id === highlightId)
    if (i <= 0) return filtered
    const next = filtered.slice()
    const [hit] = next.splice(i, 1)
    if (hit) next.unshift(hit)
    return next
  }, [workers, query, sort, statsMap, highlightId])

  async function onRemove(worker: Worker) {
    if (farmId == null) return
    setRemoveErr('')
    try {
      await api.deleteWorker(farmId, worker.id)
      onWorkersChange((list) => list.filter((w) => w.id !== worker.id))
      setConfirmId(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onWorkersChange((list) => list.filter((w) => w.id !== worker.id))
        setConfirmId(null)
        return
      }
      setRemoveErr(error instanceof ApiError ? error.message : t('workers.removeError'))
    }
  }

  if (loading) {
    return <WorkerGridSkeleton />
  }

  if (workers.length === 0) {
    return (
      <EmptyState
        text={t('workers.none')}
        action={canManage && onAddWorker
          ? { label: t('workers.add'), onClick: onAddWorker }
          : { label: t('workers.add'), disabledReason: farmId == null ? t('common.selectFarm') : t('workers.noAddPermission') }}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-soft"
            aria-hidden
          />
          <label htmlFor={searchId} className="sr-only">
            {t('workers.search')}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('workers.search')}
            autoComplete="off"
            className="w-full rounded-full bg-cream py-2 pe-3 ps-8 text-sm text-ink placeholder:text-ink-soft"
          />
        </div>
        <div
          role="group"
          aria-label={t('workers.sort')}
          className="inline-flex w-fit shrink-0 items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
        >
          <button
            type="button"
            aria-pressed={sort === 'name'}
            onClick={() => setSort('name')}
            className={`rounded-full px-3 py-1.5 ${
              sort === 'name' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('common.name')}
          </button>
          <button
            type="button"
            aria-pressed={sort === 'active'}
            onClick={() => setSort('active')}
            className={`rounded-full px-3 py-1.5 ${
              sort === 'active' ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {t('workers.recentlyActive')}
          </button>
        </div>
      </div>

      {removeErr ? (
        <p className="text-sm text-hanko" role="alert">
          {removeErr}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="text-sm text-ink-soft">{t('workers.noneMatch')}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((w) => (
            <WorkerCard
              key={w.id}
              worker={w}
              stats={statsMap.get(w.id) ?? EMPTY_STATS}
              canManage={canManage}
              canAssign={canAssign}
              confirm={confirmId === w.id}
              highlight={highlightId === w.id}
              onAskRemove={() => {
                setConfirmId(w.id)
                setRemoveErr('')
              }}
              onCancelRemove={() => {
                setConfirmId(null)
                setRemoveErr('')
              }}
              onRemove={() => void onRemove(w)}
              onSendTask={onSendTask ? () => onSendTask(w) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function WorkerCard({
  worker,
  stats,
  canManage,
  canAssign,
  confirm,
  highlight,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onSendTask,
}: {
  worker: Worker
  stats: WorkerStats
  canManage: boolean
  canAssign: boolean
  confirm: boolean
  highlight: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
  onSendTask?: () => void
}) {
  return (
    <li
      className={`min-w-0 rounded-card border border-line p-3 ${
        highlight ? 'bg-leaf-soft/40 ring-2 ring-leaf' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Portrait name={worker.name} photo={worker.photo} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-lg leading-tight text-ink">{worker.name}</p>
              <EnteredBy record={worker} />
              {worker.role_label ? (
                <p className="mt-0.5 truncate text-xs text-ink-soft">{worker.role_label}</p>
              ) : null}
            </div>
            {canManage && !confirm ? (
              <button
                type="button"
                onClick={onAskRemove}
                aria-label={t('common.removeNamed', { name: worker.name })}
                className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-hanko"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink-soft">{openDoneLine(stats.open, stats.done)}</p>
          <p className="mt-0.5 text-xs text-ink-soft">{lastTaskLabel(stats.latest)}</p>
          {canManage && confirm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <p className="text-ink">{t('common.remove')}{' '} {worker.name}?</p>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
              >
                {t('common.yes')}
              </button>
              <button
                type="button"
                onClick={onCancelRemove}
                className="rounded-full border border-line px-3 py-1 text-xs"
              >
                {t('common.no')}
              </button>
            </div>
          ) : null}
          {canAssign && onSendTask ? (
            <button
              type="button"
              onClick={onSendTask}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
            >
              <Send className="rtl:-scale-x-100" size={14} aria-hidden />
              {t('workers.sendTask')}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function WorkerGridSkeleton() {
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
