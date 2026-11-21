import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import {
  ApiError,
  api,
  canAssignTasks,
  type Task,
  type Worker,
  type WorkerPlot,
} from '../../api'
import { formatRelative } from '../../lib/status'

export function TasksTab({
  farmId,
  role,
  workers,
  plots,
  tasks,
  onTasksChange,
  preselectWorkerId,
  preselectSeq,
  onOpenWorkers,
}: {
  farmId: number | null
  role: string
  workers: Worker[]
  plots: WorkerPlot[]
  tasks: Task[]
  onTasksChange: (update: (prev: Task[]) => Task[]) => void
  preselectWorkerId: number | null
  preselectSeq: number
  onOpenWorkers: () => void
}) {
  const canAssign = canAssignTasks(role)
  const workerIdAttr = useId()
  const plotIdAttr = useId()
  const titleId = useId()
  const detailsId = useId()
  const filterId = useId()

  const orderedWorkers = workers

  const defaultWorker = orderedWorkers[0]?.id ?? null
  const [workerId, setWorkerId] = useState<number | null>(defaultWorker)
  const [plotId, setPlotId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [taskBusy, setTaskBusy] = useState<number | null>(null)
  const [taskError, setTaskError] = useState('')
  const [filterWorkerId, setFilterWorkerId] = useState<number | null>(null)

  useEffect(() => {
    // seq changes when Send task is clicked again for the same worker.
    if (preselectWorkerId == null) return
    setWorkerId(preselectWorkerId)
  }, [preselectWorkerId, preselectSeq])

  const selectedWorker =
    workerId != null && orderedWorkers.some((w) => w.id === workerId)
      ? workerId
      : defaultWorker

  const activeFilter =
    filterWorkerId != null && workers.some((w) => w.id === filterWorkerId)
      ? filterWorkerId
      : null

  const visibleTasks = useMemo(() => {
    if (activeFilter == null) return tasks
    return tasks.filter((t) => t.worker_id === activeFilter)
  }, [tasks, activeFilter])

  async function onSend(e: FormEvent) {
    e.preventDefault()
    if (farmId == null || busy || selectedWorker == null) return
    const trimmed = title.trim()
    if (!trimmed) {
      setErr(t('common.titleRequired'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const created = await api.createTask(farmId, {
        worker_id: selectedWorker,
        plot_id: plotId,
        title: trimmed,
        details: details.trim(),
      })
      onTasksChange((list) => [created, ...list.filter((t) => t.id !== created.id)].slice(0, 50))
      if (activeFilter != null && activeFilter !== created.worker_id) setFilterWorkerId(null)
      setTitle('')
      setDetails('')
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('chat.taskError'))
    } finally {
      setBusy(false)
    }
  }

  async function completeTask(task: Task) {
    if (farmId == null || taskBusy != null) return
    setTaskBusy(task.id)
    setTaskError('')
    try {
      const updated = await api.completeTask(farmId, task.id)
      onTasksChange((list) => list.map((t) => (t.id === updated.id ? updated : t)))
    } catch (error) {
      setTaskError(error instanceof ApiError ? error.message : t('workers.taskDoneError'))
    } finally {
      setTaskBusy(null)
    }
  }

  const emptyList = activeFilter != null ? t('workers.noWorkerTasks') : t('workers.noTasks')

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      {canAssign ? (
        <form
          onSubmit={onSend}
          className="rounded-card border border-line bg-white p-3"
          aria-label={t('workers.newTask')}
        >
          <h3 className="font-serif text-base text-ink">{t('workers.newTask')}</h3>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor={workerIdAttr} className="text-xs font-medium text-ink-soft">
                {t('workers.worker')}
              </label>
              <select
                id={workerIdAttr}
                value={selectedWorker ?? ''}
                onChange={(e) => setWorkerId(e.target.value ? Number(e.target.value) : null)}
                disabled={busy || orderedWorkers.length === 0 || farmId == null}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                {orderedWorkers.length === 0 ? (
                  <option value="">{t('workers.noWorkers')}</option>
                ) : (
                  orderedWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label htmlFor={plotIdAttr} className="text-xs font-medium text-ink-soft">
                {t('plots.plot')}
              </label>
              <select
                id={plotIdAttr}
                value={plotId ?? ''}
                onChange={(e) => setPlotId(e.target.value ? Number(e.target.value) : null)}
                disabled={busy || farmId == null}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="">{t('workers.wholeFarm')}</option>
                {plots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.crop_label ? ` · ${p.crop_label}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={titleId} className="text-xs font-medium text-ink-soft">
                {t('common.title')}
              </label>
              <input
                id={titleId}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                disabled={busy || farmId == null}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </div>
            <div>
              <label htmlFor={detailsId} className="text-xs font-medium text-ink-soft">
                {t('common.details')}
              </label>
              <textarea
                id={detailsId}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                disabled={busy || farmId == null}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </div>
            {err ? (
              <p className="text-sm text-hanko" role="alert">
                {err}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || farmId == null || selectedWorker == null || !title.trim()}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              <Send className="rtl:-scale-x-100" size={14} aria-hidden />
              {busy ? t('common.saving') : t('workers.assignAction')}
            </button>
          </div>
        </form>
      ) : null}

      {workers.length > 0 ? (
        <div>
          <label htmlFor={filterId} className="text-xs font-medium text-ink-soft">
            {t('workers.filterTasks')}
          </label>
          <select
            id={filterId}
            value={activeFilter ?? ''}
            onChange={(e) => setFilterWorkerId(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">{t('workers.allWorkers')}</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {taskError ? (
        <p className="text-sm text-hanko" role="alert">
          {taskError}
        </p>
      ) : null}

      {visibleTasks.length === 0 ? (
        <EmptyState
          text={emptyList}
          action={activeFilter != null
            ? { label: t('workers.allTasks'), onClick: () => setFilterWorkerId(null) }
            : !canAssign
              ? { label: t('workers.assign'), disabledReason: t('workers.noAssignPermission') }
              : orderedWorkers.length === 0
                ? { label: t('workers.open'), onClick: onOpenWorkers }
                : { label: t('workers.assign'), onClick: () => document.getElementById(workerIdAttr)?.focus() }}
        />
      ) : (
        <ul className="space-y-2">
          {visibleTasks.map((task) => {
            const done = task.status === 'done'
            return (
              <li key={task.id} className="rounded-card border border-line bg-white p-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words text-ink">{task.title}</p>
                    <EnteredBy record={task} />
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {task.worker_name}
                      {task.plot_name ? ` · ${task.plot_name}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1" aria-live="polite">
                    {done ? (
                      <span className="rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest">
                        {t('common.done')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-ochre-soft/60 px-2 py-0.5 text-[11px] font-medium text-ink">
                        {t('common.pending')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-ink-soft">
                    {task.done_at
                      ? t('workers.doneOn', { time: formatRelative(task.done_at) })
                      : formatRelative(task.created_at)}
                  </p>
                  {canAssign && !done ? (
                    <button
                      type="button"
                      onClick={() => void completeTask(task)}
                      disabled={taskBusy != null}
                      className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {taskBusy === task.id ? t('common.saving') : t('workers.markDone')}
                    </button>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
