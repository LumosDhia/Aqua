import { t } from '../../i18n'
import { jobsHref } from '../../lib/view'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApiError,
  api,
  canManageJobs,
  type Engagement,
  type EngagementStatus,
} from '../../api'
import { Portrait } from '../Portrait'
import { messagesHref } from '../../lib/view'
import { Chip } from '../market/Chip'
import { PersonDialog } from '../PersonDialog'
import { ReportButton } from '../reports/ReportButton'
import {
  engagementDates,
  engagementKindClass,
  engagementKindLabel,
  engagementStatusMeta,
} from './engagement'
import { WorkActionDialog, type WorkAction } from './WorkActionDialog'

type Filter = 'all' | EngagementStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', get label() { return t('common.all') } },
  { id: 'active', get label() { return t('common.active') } },
  { id: 'finished', get label() { return t('common.finished') } },
  { id: 'disapproved', get label() { return t('workers.disapproved') } },
]

type HiredWorkersTabProps = {
  farmId: number | null
  role: string
}

function upgradedFromIds(rows: Engagement[]): Set<number> {
  const ids = new Set<number>()
  for (const e of rows) {
    if (e.upgraded_from_id != null) ids.add(e.upgraded_from_id)
  }
  return ids
}

export function HiredWorkersTab({ farmId, role }: HiredWorkersTabProps) {
  const canManage = canManageJobs(role)

  const [filter, setFilter] = useState<Filter>('all')
  const [items, setItems] = useState<Engagement[]>([])
  const [upgraded, setUpgraded] = useState<Set<number>>(() => new Set())
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [profile, setProfile] = useState<{ id: number; engagementId: number } | null>(null)
  const [action, setAction] = useState<{ mode: WorkAction; eng: Engagement } | null>(null)
  const seqRef = useRef(0)

  useEffect(() => {
    setFilter('all')
    setItems([])
    setUpgraded(new Set())
    setLoadErr('')
    setReady(false)
    setProfile(null)
    setAction(null)
  }, [farmId])

  useEffect(() => {
    if (farmId == null) {
      setReady(true)
      setItems([])
      setUpgraded(new Set())
      setLoadErr('')
      return
    }

    const id = farmId
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')

    async function load() {
      try {
        const status = filter === 'all' ? undefined : filter
        const listP = api.farmEngagements(id, status)
        // Finished cards hide "Offer full time" using upgraded_from_id on the new active row.
        const extraP =
          filter === 'finished' ? api.farmEngagements(id, 'active') : Promise.resolve([] as Engagement[])
        const [rows, extra] = await Promise.all([listP, extraP])
        if (cancelled || my !== seqRef.current) return
        setItems(rows)
        setUpgraded(upgradedFromIds(filter === 'finished' ? extra : rows))
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        setItems([])
        setUpgraded(new Set())
        setLoadErr(e instanceof ApiError ? e.message : t('workers.hiredLoadError'))
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load()
    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [farmId, filter, retryTick])

  const emptyCopy = useMemo(() => {
    if (filter === 'active') return t('workers.noActive')
    if (filter === 'finished') return t('workers.noFinished')
    if (filter === 'disapproved') return t('workers.noDisapproved')
    return t('workers.noHired')
  }, [filter])

  function onSaved(mode: WorkAction, fromId: number) {
    if (mode === 'upgrade') {
      setUpgraded((prev) => {
        const next = new Set(prev)
        next.add(fromId)
        return next
      })
    }
    setRetryTick((n) => n + 1)
  }

  const showEmpty = ready && !loadErr && items.length === 0 && farmId != null

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div
        role="group"
        aria-label={t('workers.filterHired')}
        className="inline-flex w-fit max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-xs sm:text-sm"
      >
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 sm:px-4 ${
              filter === f.id ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
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
        {farmId == null ? (
          <p className="text-sm text-ink-soft">{t('workers.joinForHired')}</p>
        ) : !ready ? (
          <HiredGridSkeleton />
        ) : loadErr && items.length === 0 ? null : showEmpty ? (
          <EmptyState text={emptyCopy} action={{ label: t('workers.viewPosts'), href: jobsHref('mine') }} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((eng) => (
              <HiredCard
                key={eng.id}
                engagement={eng}
                canManage={canManage}
                upgraded={upgraded.has(eng.id)}
                onViewProfile={
                  eng.worker
                    ? () => {
                        const id = eng.worker?.id
                        if (id != null) setProfile({ id, engagementId: eng.id })
                      }
                    : undefined
                }
                onFinish={() => setAction({ mode: 'finish', eng })}
                onDisapprove={() => setAction({ mode: 'disapprove', eng })}
                onUpgrade={() => setAction({ mode: 'upgrade', eng })}
              />
            ))}
          </ul>
        )}
      </div>

      <PersonDialog
        open={profile != null}
        userId={profile?.id ?? null}
        engagementId={profile?.engagementId}
        onClose={() => setProfile(null)}
      />
      <WorkActionDialog
        open={action != null}
        mode={action?.mode ?? null}
        engagement={action?.eng ?? null}
        onClose={() => setAction(null)}
        onSaved={onSaved}
      />
    </div>
  )
}

function HiredCard({
  engagement,
  canManage,
  upgraded,
  onViewProfile,
  onFinish,
  onDisapprove,
  onUpgrade,
}: {
  engagement: Engagement
  canManage: boolean
  upgraded: boolean
  onViewProfile?: () => void
  onFinish: () => void
  onDisapprove: () => void
  onUpgrade: () => void
}) {
  const name = engagement.worker?.name?.trim() || t('workers.worker')
  const status = engagementStatusMeta(engagement.status)
  const dates = engagementDates(engagement.start_date, engagement.end_date)
  const showFinish = canManage && engagement.status === 'active'
  const showUpgrade =
    canManage &&
    engagement.status === 'finished' &&
    engagement.kind === 'temporary' &&
    !upgraded
  const note = engagement.note.trim()
  const reason = (engagement.reason ?? '').trim()

  return (
    <li data-card="" className="min-w-0 rounded-card border border-line bg-white p-3">
      <div className="flex min-w-0 items-start gap-3">
        <Portrait name={name} photo={engagement.worker?.photo} />
        <div className="min-w-0 flex-1">
          {onViewProfile ? (
            <button
              type="button"
              onClick={onViewProfile}
              aria-label={t('workers.viewPerson', { name: name })}
              className="block w-full truncate text-start font-serif text-lg leading-tight text-ink hover:underline"
            >
              {name}
            </button>
          ) : (
            <p className="truncate font-serif text-lg leading-tight text-ink">{name}</p>
          )}
          <p className="mt-0.5 truncate text-sm text-ink">{engagement.title}</p>
          <EnteredBy record={engagement} />
          <div className="mt-2 flex flex-wrap gap-1">
            <Chip className={engagementKindClass(engagement.kind)}>
              {engagementKindLabel(engagement.kind)}
            </Chip>
            <Chip className={status.className}>{status.label}</Chip>
          </div>
          {dates ? <p className="mt-2 text-xs text-ink-soft">{dates}</p> : null}
          {engagement.status === 'finished' && note ? (
            <p className="mt-2 text-sm break-words text-ink">
              <span className="text-ink-soft">{t('workers.yourNote')}{' '} </span>
              {note}
            </p>
          ) : null}
          {engagement.status === 'disapproved' && reason ? (
            <p className="mt-2 text-sm break-words text-ink">
              <span className="text-ink-soft">{t('workers.reasonLabel')}{' '} </span>
              {reason}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={messagesHref(engagement.id)}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
            >
              {t('common.message')}
            </a>
            {engagement.worker ? (
              <ReportButton
                targetUserId={engagement.worker.id}
                targetName={name}
                engagementId={engagement.id}
              />
            ) : null}
            {showFinish ? (
              <>
                <button
                  type="button"
                  onClick={onFinish}
                  className="rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t('workers.finish')}
                </button>
                <button
                  type="button"
                  onClick={onDisapprove}
                  className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
                >
                  {t('workers.disapprove')}
                </button>
              </>
            ) : null}
            {showUpgrade ? (
              <button
                type="button"
                onClick={onUpgrade}
                className="rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
              >
                {t('workers.offer')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  )
}

function HiredGridSkeleton() {
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
