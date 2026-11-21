import { t } from '../../i18n'
import { useState } from 'react'
import { Check, Sparkles, Trash2 } from 'lucide-react'
import { ApiError, api, type ProposedChange } from '../../api'

export function parseProposedChanges(value: unknown): ProposedChange[] {
  if (!Array.isArray(value)) return []
  const out: ProposedChange[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const r = o.request as Record<string, unknown> | undefined
    if (o.kind !== 'change' || typeof o.summary !== 'string' || !r || typeof r.path !== 'string') continue
    if (r.method !== 'POST' && r.method !== 'PATCH' && r.method !== 'PUT' && r.method !== 'DELETE') continue
    if (!r.path.startsWith('/api/')) continue
    out.push({
      kind: 'change',
      summary: o.summary,
      danger: o.danger === true,
      done: typeof o.done === 'string' ? o.done : t('common.done'),
      request: { method: r.method, path: r.path, body: r.body && typeof r.body === 'object' ? (r.body as Record<string, unknown>) : null },
    })
  }
  return out
}

type RowState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done' } | { kind: 'dismissed' } | { kind: 'failed'; error: string }

export function ProposedChanges({
  messageId,
  changes,
  canChange,
}: {
  farmId?: number | null
  messageId: string
  changes: ProposedChange[]
  canChange: boolean
}) {
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const stateOf = (i: number): RowState => rows[`${messageId}:${i}`] ?? { kind: 'idle' }
  const setRow = (i: number, next: RowState) => setRows((r) => ({ ...r, [`${messageId}:${i}`]: next }))

  async function apply(i: number) {
    const ch = changes[i]
    if (!ch || stateOf(i).kind === 'busy' || stateOf(i).kind === 'done') return
    setRow(i, { kind: 'busy' })
    try {
      await api.runChange(ch.request)
      setRow(i, { kind: 'done' })
    } catch (e) {
      setRow(i, { kind: 'failed', error: e instanceof ApiError ? e.message : t('chat.changeError') })
    }
  }

  async function applyAll() {
    for (let i = 0; i < changes.length; i++) {
      if (stateOf(i).kind === 'idle' && !changes[i]?.danger) await apply(i)
    }
  }

  const pending = changes.filter((ch, i) => stateOf(i).kind === 'idle' && !ch.danger).length
  const viewerTitle = canChange ? undefined : t('chat.changeForbidden')

  return (
    <div className="rounded-card border border-line bg-white p-3 shadow-shell">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif text-base text-ink">{t('chat.waitingChanges')}</h3>
        {pending > 1 ? (
          <button
            type="button"
            onClick={() => void applyAll()}
            disabled={!canChange}
            title={viewerTitle}
            className="inline-flex items-center gap-1 rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
          >
            <Check size={12} aria-hidden /> {' '}{t('chat.approveAll')}
          </button>
        ) : null}
      </div>
      <ul className="mt-2 space-y-2">
        {changes.map((ch, i) => {
          const st = stateOf(i)
          if (st.kind === 'dismissed') return null
          return (
            <li key={`${messageId}-${i}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-cream p-2">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink">
                {ch.danger ? <Trash2 size={16} className="shrink-0 text-hanko" aria-hidden /> : <Sparkles size={16} className="shrink-0 text-forest" aria-hidden />}
                <span className="break-words">{ch.summary}</span>
              </span>
              {st.kind === 'done' ? (
                <span className="rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest">{ch.done}</span>
              ) : (
                <span className="flex items-center gap-2">
                  {st.kind === 'failed' ? <span className="text-xs text-hanko">{st.error}</span> : null}
                  <button
                    type="button"
                    onClick={() => setRow(i, { kind: 'dismissed' })}
                    disabled={st.kind === 'busy'}
                    className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft disabled:opacity-60"
                  >
                    {t('common.skip')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void apply(i)}
                    disabled={!canChange || st.kind === 'busy'}
                    title={viewerTitle}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white disabled:opacity-60 ${ch.danger ? 'bg-hanko' : 'bg-forest-deep'}`}
                  >
                    <Check size={12} aria-hidden />
                    {st.kind === 'busy' ? t('common.working') : ch.danger ? t('chat.approveRemove') : t('common.approve')}
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
