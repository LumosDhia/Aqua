import { t } from '../../i18n'
import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { ApiError, api, type ProposedTask } from '../../api'

export function parseProposedTasks(value: unknown): ProposedTask[] {
  if (!Array.isArray(value)) return []
  const out: ProposedTask[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (o.worker_id !== null && typeof o.worker_id !== 'number') continue
    if (typeof o.worker_name !== 'string') continue
    if (o.plot_id !== null && typeof o.plot_id !== 'number') continue
    if (o.plot_name !== null && typeof o.plot_name !== 'string') continue
    if (typeof o.title !== 'string') continue
    if (typeof o.details !== 'string') continue
    out.push({
      worker_id: o.worker_id,
      worker_name: o.worker_name,
      plot_id: o.plot_id,
      plot_name: o.plot_name,
      title: o.title,
      details: o.details,
    })
  }
  return out
}

type RowState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'sent' }
  | { kind: 'done' }
  | { kind: 'failed'; error: string }

function keyOf(messageId: string, taskIndex: number): string {
  return `${messageId}:${taskIndex}`
}

export function ProposedTasks({
  farmId,
  messageId,
  tasks,
  canAssign,
}: {
  farmId: number | null
  messageId: string
  tasks: ProposedTask[]
  canAssign: boolean
}) {
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const [allBusy, setAllBusy] = useState(false)

  const sendable = tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => {
      if (t.worker_id == null) return false
      const st = rows[keyOf(messageId, i)]
      return !st || st.kind === 'idle'
    })

  function setRow(taskIndex: number, next: RowState) {
    const k = keyOf(messageId, taskIndex)
    rowsRef.current = { ...rowsRef.current, [k]: next }
    setRows(rowsRef.current)
  }

  async function sendOne(taskIndex: number): Promise<void> {
    const task = tasks[taskIndex]
    if (!task || task.worker_id == null || farmId == null) return
    const k = keyOf(messageId, taskIndex)
    const cur = rowsRef.current[k]
    if (cur && cur.kind !== 'idle' && cur.kind !== 'failed') return
    setRow(taskIndex, { kind: 'busy' })
    try {
      const result = await api.createTask(farmId, {
        worker_id: task.worker_id,
        plot_id: task.plot_id,
        title: task.title,
        details: task.details,
      })
      setRow(taskIndex, { kind: result.status === 'done' ? 'done' : 'sent' })
    } catch (e) {
      setRow(taskIndex, {
        kind: 'failed',
        error: e instanceof ApiError ? e.message : t('chat.taskError'),
      })
    }
  }

  async function sendAll() {
    if (!canAssign || farmId == null || allBusy) return
    setAllBusy(true)
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      if (!task || task.worker_id == null) continue
      const st = rowsRef.current[keyOf(messageId, i)]
      if (st && st.kind !== 'idle') continue
      await sendOne(i)
    }
    setAllBusy(false)
  }

  const viewerTitle = canAssign ? undefined : t('chat.taskForbidden')
  const canSendAll = sendable.length > 0
  const showSendAll = tasks.some((t) => t.worker_id != null)

  return (
    <div className="rounded-card border border-line bg-white p-3 shadow-shell">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-base text-ink">{t('chat.suggestedTasks')}</h3>
        {showSendAll ? (
          <button
            type="button"
            onClick={() => void sendAll()}
            disabled={!canAssign || !canSendAll || allBusy || farmId == null}
            title={viewerTitle}
            className="inline-flex items-center gap-1 rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            <Send className="rtl:-scale-x-100" size={12} aria-hidden />
            {allBusy ? t('common.sending') : t('chat.sendAll')}
          </button>
        ) : null}
      </div>
      <ul className="mt-2 space-y-2">
        {tasks.map((task, i) => {
          const st = rows[keyOf(messageId, i)] ?? { kind: 'idle' }
          return (
            <li key={`${messageId}-${i}`} className="min-w-0 rounded-xl border border-line bg-cream p-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {task.worker_id == null ? (
                  <span className="rounded-full bg-ochre-soft/60 px-2 py-0.5 text-[11px] font-medium text-ink">
                    {t('chat.noMatchingWorker')}
                  </span>
                ) : (
                  <span className="truncate text-sm font-medium text-ink">{task.worker_name}</span>
                )}
                {task.plot_name ? (
                  <span className="max-w-full truncate rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-soft">
                    {task.plot_name}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm font-medium break-words text-ink">{task.title}</p>
              {task.details ? (
                <p className="mt-0.5 text-xs break-words text-ink-soft">{task.details}</p>
              ) : null}
              <div className="mt-2">
                {st.kind === 'sent' ? (
                  <span className="rounded-full bg-teal/15 px-2 py-0.5 text-[11px] font-medium text-teal">
                    {t('common.sent')}
                  </span>
                ) : st.kind === 'done' ? (
                  <span className="rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest">
                    {t('common.done')}
                  </span>
                ) : st.kind === 'failed' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-hanko">
                      {t('common.requestFailed')}{' '} {st.error}
                    </span>
                    {canAssign ? (
                      <button
                        type="button"
                        onClick={() => void sendOne(i)}
                        disabled={farmId == null}
                        className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                      >
                        {t('chat.resend')}
                      </button>
                    ) : null}
                  </div>
                ) : task.worker_id == null ? null : (
                  <button
                    type="button"
                    onClick={() => void sendOne(i)}
                    disabled={!canAssign || st.kind === 'busy' || farmId == null}
                    title={viewerTitle}
                    className="inline-flex items-center gap-1 rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                  >
                    <Send className="rtl:-scale-x-100" size={12} aria-hidden />
                    {st.kind === 'busy' ? t('common.sending') : t('common.send')}
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
