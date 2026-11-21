import { t, countLabel } from '../i18n'
import { EnteredBy, AquaEstimate } from './EnteredBy'
import { useEffect, useState, type ReactNode } from 'react'
import { Briefcase, Check, Circle, Tractor } from 'lucide-react'
import { ApiError, api, type Engagement, type User, type WorkerHome as WorkerHomeData } from '../api'
import { formatInt } from '../lib/status'
import { VIEW_HREF, jobsHref, messagesHref } from '../lib/view'
import { Chip } from './market/Chip'
import { PageFrame } from './PageFrame'
import { SwitchSideDialog } from './SwitchSideDialog'
import { engagementDates, engagementKindClass, engagementKindLabel } from './workers/engagement'

type WorkerHomeProps = {
  user: User
  onUser: (user: User) => void
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0]
}

function homeSummary(active: number, pending: number | null): string {
  const jobs = countLabel('worker.activeJobs', active)
  const apps =
    pending == null ? t('worker.applicationUnavailable') : countLabel('worker.waitingApplications', pending)
  return `${jobs}, ${apps}`
}

function nearbyLine(n: number): string {
  if (n === 0) return t('worker.noNearby')
  return countLabel('worker.nearbyJobs', n)
}

function unreadLine(n: number | null): string {
  if (n == null) return t('worker.unreadUnavailable')
  if (n === 0) return t('worker.noUnread')
  return countLabel('messages.unread', n)
}

function profileReady(home: WorkerHomeData): boolean {
  return home.profile.complete && home.profile.has_cv && home.profile.visibility === 'public'
}

export function WorkerHome({ user, onUser }: WorkerHomeProps) {
  const [home, setHome] = useState<WorkerHomeData | null>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [switchOpen, setSwitchOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load(isPoll: boolean) {
      if (!isPoll) {
        setReady(false)
        setErr('')
      }
      try {
        const data = await api.workerHome()
        if (cancelled) return
        setHome({
          ...data,
          name: data.name.trim() || user.name,
        })
        setErr('')
      } catch (e) {
        if (cancelled) return
        if (!isPoll) {
          setErr(e instanceof ApiError ? e.message : t('worker.loadError'))
        }
      } finally {
        if (!cancelled) setReady(true)
      }
    }

    void load(false)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    const onFocus = () => {
      void load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onFocus)
    }
  }, [retryTick, user.name])

  const name = firstName(home?.name || user.name)
  const done = home != null && profileReady(home)
  const showProfile = home != null && !done

  return (
    <PageFrame
      demonstration={home?.profile.demo || home?.active_work.some((work) => work.farm.demo)}
      label={t('shell.home')}
      busy={!ready}
      body="contain"
      header={
        <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
              {name ? t('worker.welcome', { name: name }) : t('worker.welcomePlain')}
            </h2>
            <p className="text-xs text-ink-soft">
              {ready && home
                ? homeSummary(home.active_work.length, home.applications.pending)
                : t('worker.loading')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {done ? (
              <span className="inline-flex max-w-full truncate rounded-full bg-leaf-soft/70 px-2.5 py-1 text-[11px] font-medium text-forest">
                {t('worker.complete')}
              </span>
            ) : null}
            {home?.has_farm ? (
              <button
                type="button"
                onClick={() => setSwitchOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink"
              >
                <Tractor size={14} aria-hidden />
                {t('worker.dashboard')}
              </button>
            ) : null}
          </div>
        </header>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        {err ? (
          <div
            role="alert"
            className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
          >
            <p>{err}</p>
            <button
              type="button"
              onClick={() => {
                setErr('')
                setRetryTick((n) => n + 1)
              }}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('common.retry')}
            </button>
          </div>
        ) : null}

        {!ready && !home ? (
          <HomeSkeleton />
        ) : home ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto overscroll-contain lg:grid-cols-6 lg:grid-rows-2 lg:overflow-hidden">
            <HomeCard
              title={t('worker.active')}
              className={showProfile ? 'lg:col-span-4' : 'lg:col-span-3'}
              empty={home.active_work.length === 0}
              emptyIcon={Briefcase}
              emptyText={t('worker.noActive')}
              emptyActionHref={jobsHref('browse')}
              emptyActionLabel="Opportunities"
            >
              <ul className="space-y-2">
                {home.active_work.map((eng) => (
                  <ActiveWorkRow key={eng.id} eng={eng} />
                ))}
              </ul>
            </HomeCard>

            <HomeCard
              title={t('worker.applications')}
              className={showProfile ? 'lg:col-span-2' : 'lg:col-span-3'}
              actionHref={jobsHref('sent')}
              actionLabel="My applications"
            >
              <dl className="grid grid-cols-3 gap-2">
                <CountStat label={t('common.pending')} value={home.applications.pending} />
                <CountStat label={t('common.accepted')} value={home.applications.accepted} />
                <CountStat label={t('common.declined')} value={home.applications.declined} />
              </dl>
            </HomeCard>

            <HomeCard
              title={t('worker.nearby')}
              className={showProfile ? 'lg:col-span-2' : 'lg:col-span-3'}
            >
              {home.opportunities_nearby == null || !home.profile.has_location ? (
                <div className="flex h-full min-h-16 flex-col justify-between gap-3">
                  <p className="text-sm text-ink">{t('worker.setWhere')}</p>
                  <a
                    href={VIEW_HREF.profile}
                    className="inline-flex w-fit rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {t('shell.profile')}
                  </a>
                </div>
              ) : (
                <div className="flex h-full min-h-16 flex-col justify-between gap-3">
                  <p className="text-sm text-ink">{nearbyLine(home.opportunities_nearby)}</p>
                  <AquaEstimate note={t('estimates.nearbyJobs')} />
                  <a
                    href={jobsHref('browse')}
                    className="inline-flex w-fit rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
                  >
                    {t('jobs.opportunities')}
                  </a>
                </div>
              )}
            </HomeCard>

            <HomeCard
              title={t('shell.messages')}
              className={showProfile ? 'lg:col-span-2' : 'lg:col-span-3'}
            >
              <div className="flex h-full min-h-16 flex-col justify-between gap-3">
                <p className="text-sm text-ink">{unreadLine(home.unread_messages)}</p>
                <a
                  href={VIEW_HREF.messages}
                  className="inline-flex w-fit rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t('shell.messages')}
                </a>
              </div>
            </HomeCard>

            {showProfile ? (
              <HomeCard title={t('shell.profile')} className="lg:col-span-2">
              {home.profile.entered_by || home.profile.updated_by ? <EnteredBy record={home.profile} own /> : null}
                <ul className="space-y-2">
                  <CheckRow
                    done={home.profile.complete}
                    label={
                      home.profile.complete
                        ? t('worker.headlineAdded')
                        : t('worker.addHeadline')
                    }
                    href={VIEW_HREF.profile}
                    action="Profile"
                  />
                  <CheckRow
                    done={home.profile.visibility === 'public'}
                    label={
                      home.profile.visibility === 'public'
                        ? t('worker.public')
                        : t('worker.private')
                    }
                    href={VIEW_HREF.profile}
                    action="Profile"
                  />
                  <CheckRow
                    done={home.profile.has_cv}
                    label={home.profile.has_cv ? t('worker.cvAdded') : t('worker.cvAdd')}
                    href={VIEW_HREF.cv}
                    action="CV"
                  />
                </ul>
              </HomeCard>
            ) : null}
          </div>
        ) : null}
      </div>

      <SwitchSideDialog
        open={switchOpen}
        target="farmer"
        onClose={() => setSwitchOpen(false)}
        onDone={onUser}
      />
    </PageFrame>
  )
}

function ActiveWorkRow({ eng }: { eng: Engagement }) {
  const dates = engagementDates(eng.start_date, eng.end_date)
  const place = [eng.farm.name, eng.farm.region].filter(Boolean).join(' · ') || t('worker.noFarmLocation')
  return (
    <li className="min-w-0 rounded-xl border border-line bg-white p-2.5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{eng.title}</p>
          <EnteredBy record={eng} />
          <p className="truncate text-xs text-ink-soft">{place}</p>
          <EnteredBy record={eng.farm} />
        </div>
        <Chip className={engagementKindClass(eng.kind)}>{engagementKindLabel(eng.kind)}</Chip>
      </div>
      {dates ? <p className="mt-1.5 text-xs text-ink-soft">{dates}</p> : null}
      <a
        href={messagesHref(eng.id)}
        className="mt-2 inline-flex rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink"
      >
        {t('worker.messageFarm')}
      </a>
    </li>
  )
}

function CountStat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-white px-2 py-2 text-center">
      <dt className="truncate text-[11px] font-medium text-ink-soft">{label}</dt>
      <dd className="font-serif text-xl leading-tight text-ink">{value == null ? t('common.unavailable') : formatInt(value)}</dd>
    </div>
  )
}

function CheckRow({
  done,
  label,
  href,
  action,
}: {
  done: boolean
  label: string
  href: string
  action: string
}) {
  return (
    <li className="flex min-w-0 items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-1.5">
        <span
          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
            done ? 'bg-leaf-soft text-forest' : 'bg-ochre-soft/70 text-ink'
          }`}
          aria-hidden
        >
          {done ? <Check size={10} strokeWidth={3} /> : <Circle size={8} />}
        </span>
        <p className="min-w-0 text-sm text-ink">
          {label}
          <span className="sr-only">{done ? t('worker.doneCaption') : t('worker.actionCaption')}</span>
        </p>
      </div>
      {done ? null : (
        <a
          href={href}
          className="shrink-0 text-xs font-medium text-forest underline-offset-2 hover:underline"
        >
          {action}
        </a>
      )}
    </li>
  )
}

function HomeCard({
  title,
  className,
  actionHref,
  actionLabel,
  empty,
  emptyIcon: EmptyIcon,
  emptyText,
  emptyActionHref,
  emptyActionLabel,
  children,
}: {
  title: string
  className?: string
  actionHref?: string
  actionLabel?: string
  empty?: boolean
  emptyIcon?: typeof Briefcase
  emptyText?: string
  emptyActionHref?: string
  emptyActionLabel?: string
  children: ReactNode
}) {
  return (
    <article
      data-card=""
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-card border border-line bg-cream p-3 lg:h-full ${className ?? ''}`}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h3 className="font-serif text-base text-ink">{title}</h3>
        {actionHref && actionLabel ? (
          <a
            href={actionHref}
            className="text-xs font-medium text-forest underline-offset-2 hover:underline"
          >
            {actionLabel}
          </a>
        ) : null}
      </div>
      <div className="page-scroll mt-2 min-h-0 flex-1">
        {empty && EmptyIcon && emptyText ? (
          <div className="flex h-full min-h-24 flex-col items-center justify-center px-2 py-6 text-center">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-soft text-forest"
              aria-hidden
            >
              <EmptyIcon size={20} />
            </div>
            <p className="mt-2 text-sm text-ink-soft">{emptyText}</p>
            {emptyActionHref && emptyActionLabel ? (
              <a
                href={emptyActionHref}
                className="mt-3 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
              >
                {emptyActionLabel}
              </a>
            ) : null}
          </div>
        ) : (
          children
        )}
      </div>
    </article>
  )
}

function HomeSkeleton() {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-6 lg:grid-rows-2" aria-hidden>
      <div className="aqua-skel min-h-32 rounded-card lg:col-span-3" />
      <div className="aqua-skel min-h-32 rounded-card lg:col-span-3" />
      <div className="aqua-skel min-h-32 rounded-card lg:col-span-3" />
      <div className="aqua-skel min-h-32 rounded-card lg:col-span-3" />
    </div>
  )
}
