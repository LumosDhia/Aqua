import { t } from '../../i18n'
import { jobsHref } from '../../lib/view'
import { EmptyState } from '../EmptyState'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useRef, useState } from 'react'
import { ApiError, api, type JobApplication, type JobOffer } from '../../api'
import { Chip } from '../market/Chip'
import { applicationStatusMeta } from './format'

export function MyApplicationsTab({ tick }: { tick: number }) {
  const [items, setItems] = useState<JobApplication[]>([])
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [rowErr, setRowErr] = useState('')
  const seqRef = useRef(0)
  const [offers, setOffers] = useState<JobOffer[]>([])
  const [offerBusy, setOfferBusy] = useState<number | null>(null)
  const [offerErr, setOfferErr] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .myJobOffers()
      .then((rows) => {
        if (!cancelled) setOffers(rows)
      })
      .catch(() => {
        /* applications still show */
      })
    return () => {
      cancelled = true
    }
  }, [tick, retryTick])

  async function answer(o: JobOffer, status: 'accepted' | 'declined') {
    setOfferBusy(o.id)
    setOfferErr('')
    try {
      const saved = await api.answerJobOffer(o.id, status)
      setOffers((list) => list.map((x) => (x.id === o.id ? saved : x)))
    } catch (e) {
      setOfferErr(e instanceof ApiError ? e.message : t('jobs.invitationError'))
    } finally {
      setOfferBusy(null)
    }
  }

  const invitations =
    offers.length > 0 ? (
      <section aria-label={t('jobs.invitations')} className="mb-4 space-y-2">
        <h3 className="font-serif text-lg text-ink">{t('jobs.invitationsForYou')}</h3>
        {offerErr ? (
          <p role="alert" className="text-sm text-hanko">
            {offerErr}
          </p>
        ) : null}
        <ul className="space-y-2">
          {offers.map((o) => (
            <li key={o.id} className="min-w-0 rounded-card border border-forest/30 bg-leaf-soft/30 p-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg leading-tight text-ink">{o.job_title}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {o.farm_name}
                    {o.governorate ? ` · ${o.governorate}` : ''}
                    {o.pay_mode === 'fixed' && o.pay_amount ? ` · ${o.pay_amount} TND per ${o.pay_unit}` : ''}
                  </p>
                </div>
                <Chip
                  className={
                    o.status === 'accepted'
                      ? 'bg-leaf-soft/70 text-forest'
                      : o.status === 'declined'
                        ? 'bg-cream-deep text-ink-soft'
                        : 'bg-ochre-soft/60 text-ink'
                  }
                >
                  {o.status === 'pending' ? t('workers.invited') : o.status === 'accepted' ? t('jobs.hired') : t('common.declined')}
                </Chip>
              </div>
              {o.message ? <p className="mt-2 text-sm break-words text-ink">{o.message}</p> : null}
              {o.status === 'pending' ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void answer(o, 'accepted')}
                    disabled={offerBusy === o.id || o.job_status !== 'open'}
                    className="rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {offerBusy === o.id ? t('common.working') : t('jobs.acceptStart')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void answer(o, 'declined')}
                    disabled={offerBusy === o.id}
                    className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
                  >
                    {t('common.decline')}
                  </button>
                  {o.job_status !== 'open' ? <span className="text-xs text-ink-soft">{t('jobs.noLongerOpen')}</span> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ) : null

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setRowErr('')
    setBusyId(null)

    api
      .myJobApplications()
      .then((rows) => {
        if (cancelled || my !== seqRef.current) return
        setItems(rows)
        setLoadErr('')
      })
      .catch((e: unknown) => {
        if (cancelled || my !== seqRef.current) return
        setLoadErr(e instanceof ApiError ? e.message : t('jobs.applicationLoadError'))
      })
      .finally(() => {
        if (!cancelled && my === seqRef.current) setReady(true)
      })

    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [tick, retryTick])

  async function onWithdraw(application: JobApplication) {
    setBusyId(application.id)
    setRowErr('')
    try {
      await api.withdrawJobApplication(application.id)
      setItems((list) =>
        list.map((a) => (a.id === application.id ? { ...a, status: 'withdrawn' } : a)),
      )
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setItems((list) => list.filter((a) => a.id !== application.id))
        return
      }
      setRowErr(error instanceof ApiError ? error.message : t('jobs.withdrawError'))
    } finally {
      setBusyId(null)
    }
  }

  if (loadErr && items.length === 0 && ready) {
    return (
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
    )
  }

  if (!ready) {
    return (
      <ul className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <li key={i} className="rounded-card border border-line bg-white p-3">
            <div className="aqua-skel h-4 w-1/2 rounded" />
            <div className="aqua-skel mt-2 h-3 w-full rounded" />
            <div className="aqua-skel mt-2 h-3 w-1/3 rounded" />
          </li>
        ))}
      </ul>
    )
  }

  if (items.length === 0) {
    return (
      <div>
        {invitations}
        {offers.length === 0 ? (
          <EmptyState text={t('jobs.noApplications')} action={{ label: t('shell.findWork'), href: jobsHref('browse') }} />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {invitations}
      {rowErr ? (
        <p className="text-sm text-hanko" role="alert">
          {rowErr}
        </p>
      ) : null}
      <ul className="page-scroll h-full min-h-0 space-y-2">
        {items.map((app) => {
          const chip = applicationStatusMeta(app.status)
          return (
            <li key={app.id} className="min-w-0 rounded-card border border-line bg-white p-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg leading-tight text-ink">
                    {app.job_title}
                  </p>
                  {app.farm_name ? (
                    <p className="truncate text-xs text-ink-soft">{app.farm_name}</p>
                  ) : null}
                </div>
                <Chip className={chip.className}>{chip.label}</Chip>
              </div>
              <p className="mt-2 text-sm break-words text-ink">{app.message}</p>
              <EnteredBy record={app} />
              {app.status === 'pending' ? (
                <button
                  type="button"
                  onClick={() => void onWithdraw(app)}
                  disabled={busyId === app.id}
                  className="mt-2 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
                >
                  {busyId === app.id ? t('jobs.withdrawing') : t('jobs.withdraw')}
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
