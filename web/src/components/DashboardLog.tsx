import { t, activeLocale } from '../i18n'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Circle,
  Droplets,
  Leaf,
  PawPrint,
  PenLine,
  SprayCan,
  Sprout,
  Users,
  Wheat,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  ApiError,
  api,
  canDecide,
  canManageWater,
  isAbortError,
  type ActivityItem,
  type ActivityLog,
  type FarmVideo,
  type User,
  type WeeklyReportMeta,
} from '../api'
import { formatInt, formatRelative } from '../lib/status'
import { useDashboardPoll } from '../lib/useDashboardPoll'
import { AquaEstimate, EnteredBy } from './EnteredBy'

const FORM_KINDS = ['irrigation', 'harvest', 'spraying', 'fertilising', 'planting', 'maintenance', 'animals', 'note'] as const
const KIND_LABEL: Record<string, string> = {
  get irrigation() { return t('plots.irrigation') },
  get harvest() { return t('farm.harvest') },
  get spraying() { return t('farm.spraying') },
  get fertilising() { return t('farm.fertilising') },
  get planting() { return t('farm.planting') },
  get maintenance() { return t('farm.maintenance') },
  get animals() { return t('water.animals') },
  get people() { return t('farm.people') },
  get note() { return t('farm.note') },
}
const KIND_ICON: Record<string, LucideIcon> = {
  irrigation: Droplets,
  harvest: Wheat,
  spraying: SprayCan,
  fertilising: Leaf,
  planting: Sprout,
  maintenance: Wrench,
  animals: PawPrint,
  people: Users,
  note: PenLine,
}
const weekFmt = () => new Intl.DateTimeFormat(activeLocale(), {
  timeZone: 'Africa/Tunis', day: 'numeric', month: 'short', year: 'numeric',
})
const fullWhen = () => new Intl.DateTimeFormat(activeLocale(), {
  timeZone: 'Africa/Tunis', dateStyle: 'medium', timeStyle: 'short',
})

function formatWeek(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`)
  return Number.isFinite(date.getTime()) ? weekFmt().format(date) : iso
}

/** Mondays of the last eight finished weeks, newest first, as YYYY-MM-DD. */
function pastWeekStarts(): string[] {
  const today = new Date(`${tunisKey(new Date())}T12:00:00Z`)
  if (!Number.isFinite(today.getTime())) return []
  const monday = today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000
  return Array.from({ length: 8 }, (_, i) => new Date(monday - (i + 1) * 7 * 86_400_000).toISOString().slice(0, 10))
}

function tunisKey(date: Date) {
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function shiftKey(key: string, days: number) {
  const [year, month, day] = key.split('-').map(Number)
  if (!year || !month || !day) return ''
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function dayLabel(key: string, today: string) {
  if (!key) return t('common.dateMissing')
  if (key === today) return t('dashboard.today')
  if (key === shiftKey(today, -1)) return t('common.yesterday')
  const date = new Date(`${key}T12:00:00Z`)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(activeLocale(), { weekday: 'long', timeZone: 'UTC' }).format(date)
    : t('common.dateMissing')
}

function groupByDay(items: ActivityItem[]) {
  const today = tunisKey(new Date())
  const groups: { key: string; label: string; items: ActivityItem[] }[] = []
  for (const item of items) {
    const key = tunisKey(new Date(item.at))
    const last = groups[groups.length - 1]
    if (last?.key === key) last.items.push(item)
    else groups.push({ key, label: dayLabel(key, today), items: [item] })
  }
  return groups
}

function noteIdOf(id: string) {
  const match = /^note-(\d+)$/.exec(id)
  if (!match) return null
  const idNumber = Number(match[1])
  return Number.isSafeInteger(idNumber) ? idNumber : null
}

function ownsNote(item: ActivityItem, user: User) {
  const name = user.name.trim()
  if (name && item.entered_by?.name === name) return true
  const local = user.email.split('@')[0] ?? ''
  return Boolean(item.who && (item.who === name || (local && item.who === local)))
}

function canRemove(item: ActivityItem, user: User, role: string) {
  return item.source === 'manual' && noteIdOf(item.id) != null && (canManageWater(role) || (canDecide(role) && ownsNote(item, user)))
}

function moodWord(mood: string) {
  if (mood === 'good') return t('soil.good')
  if (mood === 'ok') return 'OK'
  if (mood === 'bad') return t('log.moodBad')
  return t('common.notSet')
}

function MoodChip({ mood, score }: { mood: string; score?: number | null }) {
  const word = moodWord(mood)
  const text = score == null ? word : `${word} · ${formatInt(score)}`
  const dot = mood === 'good' ? 'bg-leaf' : mood === 'bad' ? 'bg-hanko' : 'bg-ochre'
  const wash = mood === 'good' ? 'bg-leaf-soft' : mood === 'bad' ? 'bg-hanko/15' : 'bg-ochre/20'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-ink ${wash}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
      {text}
    </span>
  )
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function elapsedSince(iso: string, now: number) {
  const time = Date.parse(iso)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now - time) / 1000))
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    let timer = 0
    function arm() {
      window.clearInterval(timer)
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      timer = window.setInterval(() => setNow(Date.now()), 1000)
    }
    arm()
    document.addEventListener('visibilitychange', arm)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', arm)
    }
  }, [active])
  return now
}

function WatchDialog({
  week, url, loading, error, onClose,
}: {
  week: string
  url: string | null
  loading: boolean
  error: string
  onClose: () => void
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const root = panelRef.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pick = () =>
      root
        ? [...root.querySelectorAll<HTMLElement>('button:not([disabled]), video, [href], [tabindex]:not([tabindex="-1"])')]
        : []
    pick()[0]?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !root) return
      const els = pick()
      if (els.length === 0) {
        event.preventDefault()
        root.focus()
        return
      }
      const index = els.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault()
          els[els.length - 1].focus()
        }
      } else if (index === -1 || index === els.length - 1) {
        event.preventDefault()
        els[0].focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-forest-deep/45" aria-label={t('common.closeDialog')} tabIndex={-1} onClick={onClose} />
      <div ref={panelRef} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} className="relative z-10 w-full max-w-2xl rounded-card border border-line bg-paper p-4 shadow-shell">
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-xl text-ink">{t('log.weekOf')}{' '} {formatWeek(week)}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink-soft hover:bg-cream" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        {loading ? <div className="aqua-skel mt-3 h-48 rounded-card" role="status" aria-label={t('log.loadingFilm')} /> : null}
        {error ? <p role="alert" className="mt-3 text-sm text-hanko">{error}</p> : null}
        {url ? <video controls src={url} className="mt-3 max-h-[70dvh] w-full rounded-card bg-forest-deep" /> : null}
      </div>
    </div>,
    document.body,
  )
}

function AddLogForm({
  farmId, plots, onAdded,
}: {
  farmId: number
  plots: { id: number; name: string }[]
  onAdded: () => void
}) {
  const kindId = useId()
  const titleId = useId()
  const detailId = useId()
  const plotId = useId()
  const [kind, setKind] = useState<(typeof FORM_KINDS)[number]>('note')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [plot, setPlot] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const cleanTitle = title.trim()
    if (cleanTitle.length < 2) {
      setError(t('log.titleMinimum'))
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.addFarmActivity(farmId, {
        kind,
        title: cleanTitle,
        detail: detail.trim(),
        plot_id: plot ? Number(plot) : null,
      })
      setTitle('')
      setDetail('')
      setPlot('')
      onAdded()
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : t('log.addNoteError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form aria-label={t('log.add')} className="grid gap-2 rounded-card border border-line bg-paper p-3" onSubmit={(event) => void submit(event)}>
      <h3 className="font-serif text-base text-ink">{t('log.add')}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label htmlFor={kindId} className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{t('water.kind')}</label>
          <select id={kindId} value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as (typeof FORM_KINDS)[number])} className="mt-1 w-full rounded-xl border border-line bg-white px-2 py-1.5 text-sm text-ink">
            {FORM_KINDS.map((item) => <option key={item} value={item}>{KIND_LABEL[item]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={plotId} className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{t('plots.plot')}</label>
          <select id={plotId} value={plot} disabled={busy} onChange={(event) => setPlot(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-2 py-1.5 text-sm text-ink">
            <option value="">{t('log.noPlot')}</option>
            {plots.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor={titleId} className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{t('common.title')}</label>
        <input id={titleId} value={title} maxLength={160} disabled={busy} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-line bg-white px-2 py-1.5 text-sm text-ink" />
      </div>
      <div>
        <label htmlFor={detailId} className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{t('common.detail')}{' '} <span className="normal-case">{t('common.optional')}</span></label>
        <textarea id={detailId} value={detail} maxLength={800} rows={2} disabled={busy} onChange={(event) => setDetail(event.target.value)} className="mt-1 w-full resize-y rounded-xl border border-line bg-white px-2 py-1.5 text-sm text-ink" />
      </div>
      {error ? <p role="alert" className="text-xs text-hanko">{error}</p> : null}
      <div>
        <button type="submit" disabled={busy} className="rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
          {busy ? t('common.saving') : t('log.add')}
        </button>
      </div>
    </form>
  )
}

export function DashboardLog({
  farmId, role, user, plots,
}: {
  farmId: number
  role: string
  user: User
  plots: { id: number; name: string }[]
}) {
  const [log, setLog] = useState<ActivityLog | null>(null)
  const [logError, setLogError] = useState('')
  const [logRevision, reviseLog] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [reports, setReports] = useState<WeeklyReportMeta[] | null>(null)
  const [reportListError, setReportListError] = useState('')
  const [reportError, setReportError] = useState('')
  const [reportNotice, setReportNotice] = useState('')
  const [makingReport, setMakingReport] = useState(false)
  const [videos, setVideos] = useState<FarmVideo[] | null>(null)
  const [videoListError, setVideoListError] = useState('')
  const [videoError, setVideoError] = useState('')
  const [videoNotice, setVideoNotice] = useState('')
  const [videoRevision, reviseVideos] = useState(0)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [active, setActive] = useState<FarmVideo | null>(null)
  const [fileError, setFileError] = useState('')
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [watch, setWatch] = useState<{ id: number; week: string; url: string | null; error: string; loading: boolean } | null>(null)
  const watchUrl = useRef<string | null>(null)
  const watchRequest = useRef(0)
  const canWrite = canDecide(role)
  const canManage = canManageWater(role)
  const makingVideo = active?.status === 'queued' || active?.status === 'rendering'
  const now = useNow(makingReport || makingVideo)
  const reportStarted = useRef(0)
  const loadLog = useCallback(async (signal: AbortSignal) => {
    try {
      const next = await api.farmActivity(farmId, 7, signal)
      if (!signal.aborted) {
        setLog(next)
        setLogError('')
      }
    } catch (reason) {
      if (signal.aborted || isAbortError(reason)) return
      setLogError(reason instanceof ApiError ? reason.message : t('log.loadError'))
    }
  }, [farmId])
  useDashboardPoll(loadLog, 30_000, logRevision)

  const loadReports = useCallback(async (signal: AbortSignal) => {
    try {
      const page = await api.farmReports(farmId, signal)
      if (!signal.aborted) {
        setReports(page.reports)
        setReportListError('')
      }
    } catch (reason) {
      if (signal.aborted || isAbortError(reason)) return
      setReportListError(reason instanceof ApiError ? reason.message : t('log.reportsError'))
    }
  }, [farmId])

  useEffect(() => {
    const controller = new AbortController()
    void loadReports(controller.signal)
    void api.farmVideos(farmId, controller.signal).then(
      (page) => {
        if (controller.signal.aborted) return
        setVideos(page.videos)
        setVideoListError('')
        const running = page.videos.find((video) => video.status === 'queued' || video.status === 'rendering')
        if (running) {
          setActiveId(running.id)
          setActive(running)
        }
      },
      (reason: unknown) => {
        if (controller.signal.aborted || isAbortError(reason)) return
        setVideoListError(reason instanceof ApiError ? reason.message : t('log.filmsError'))
      },
    )
    return () => controller.abort()
  }, [farmId, loadReports, videoRevision])

  useEffect(() => {
    if (activeId == null) return
    let timer = 0
    let stopped = false
    async function tick() {
      if (stopped || document.visibilityState !== 'visible') return
      try {
        const job = await api.farmVideo(farmId, activeId as number)
        if (stopped) return
        setActive(job)
        setVideoError('')
        setVideos((list) => {
          const current = list ?? []
          const index = current.findIndex((video) => video.id === job.id)
          if (index === -1) return [job, ...current]
          const copy = current.slice()
          copy[index] = job
          return copy
        })
        if (job.status === 'done' || job.status === 'failed') {
          if (job.status === 'failed') setVideoError(job.error.trim() || t('log.filmFailed'))
          else setVideoError('')
          setActiveId(null)
          return
        }
      } catch (reason) {
        if (!stopped && !isAbortError(reason)) {
          setVideoError(reason instanceof ApiError ? reason.message : t('log.filmCheckError'))
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), 3000)
    }
    function onVisibility() {
      window.clearTimeout(timer)
      if (document.visibilityState === 'visible') void tick()
    }
    void tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [farmId, activeId])

  useEffect(() => () => {
    if (watchUrl.current) URL.revokeObjectURL(watchUrl.current)
  }, [])

  async function remove(item: ActivityItem) {
    const id = noteIdOf(item.id)
    if (id == null || deleting) return
    setDeleting(true)
    setDeleteError('')
    try {
      await api.deleteFarmActivity(farmId, id)
      setPendingDelete(null)
      reviseLog((value) => value + 1)
    } catch (reason) {
      setDeleteError(reason instanceof ApiError ? reason.message : t('log.deleteNoteError'))
    } finally {
      setDeleting(false)
    }
  }

  async function makeReport(week?: string): Promise<WeeklyReportMeta | null> {
    if (!canManage || makingReport) return null
    setMakingReport(true)
    setReportNotice('')
    setReportError('')
    reportStarted.current = Date.now()
    try {
      const made = await api.makeWeeklyReport(farmId, week)
      try {
        const page = await api.farmReports(farmId)
        setReports(page.reports)
      } catch {
        setReports((list) => [made, ...(list ?? []).filter((report) => report.id !== made.id)])
      }
      setReportNotice(t('log.reportReady'))
      return made
    } catch (reason) {
      setReportError(reason instanceof ApiError ? reason.message : t('log.reportCreateError'))
      return null
    } finally {
      setMakingReport(false)
    }
  }

  async function makeVideo(week?: string) {
    if (!canManage || makingVideo) return
    setVideoError('')
    setVideoNotice('')
    try {
      const job = await api.makeFarmVideo(farmId, week)
      setActive(job)
      setActiveId(job.id)
      setVideos((list) => [job, ...(list ?? []).filter((video) => video.id !== job.id)])
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setVideoNotice(reason.message)
        try {
          const page = await api.farmVideos(farmId)
          setVideos(page.videos)
          const running = page.videos.find((video) => video.status === 'queued' || video.status === 'rendering')
          if (running) {
            setActive(running)
            setActiveId(running.id)
          }
        } catch (follow) {
          setVideoError(follow instanceof ApiError ? follow.message : t('log.filmMissing'))
        }
        return
      }
      setVideoError(reason instanceof ApiError ? reason.message : t('log.filmStartError'))
    }
  }

  async function pastPdf(week: string) {
    const existing = reports?.find((report) => report.week_start === week)
    const report = existing ?? (await makeReport(week))
    if (report) await downloadReport(report)
  }

  async function pastVideo(week: string) {
    const existing = videos?.find((video) => video.week_start === week && video.ready)
    if (existing) await openWatch(existing)
    else await makeVideo(week)
  }

  async function downloadReport(report: WeeklyReportMeta) {
    const key = `report-${report.id}`
    if (busyFile) return
    setBusyFile(key)
    setFileError('')
    try {
      saveBlob(await api.farmReportPdf(farmId, report.id), `aqua-week-${report.week_start}.pdf`)
    } catch (reason) {
      setFileError(reason instanceof ApiError ? reason.message : t('log.pdfError'))
    } finally {
      setBusyFile(null)
    }
  }

  async function downloadVideo(video: FarmVideo) {
    const key = `video-${video.id}`
    if (busyFile) return
    setBusyFile(key)
    setFileError('')
    try {
      saveBlob(await api.farmVideoFile(farmId, video.id), `aqua-week-${video.week_start}.mp4`)
    } catch (reason) {
      setFileError(reason instanceof ApiError ? reason.message : t('log.filmDownloadError'))
    } finally {
      setBusyFile(null)
    }
  }

  function closeWatch() {
    watchRequest.current += 1
    if (watchUrl.current) URL.revokeObjectURL(watchUrl.current)
    watchUrl.current = null
    setWatch(null)
  }

  async function openWatch(video: FarmVideo) {
    const request = watchRequest.current + 1
    watchRequest.current = request
    if (watchUrl.current) URL.revokeObjectURL(watchUrl.current)
    watchUrl.current = null
    setWatch({ id: video.id, week: video.week_start, url: null, error: '', loading: true })
    try {
      const blob = await api.farmVideoFile(farmId, video.id)
      if (watchRequest.current !== request) return
      const url = URL.createObjectURL(blob)
      if (watchRequest.current !== request) {
        URL.revokeObjectURL(url)
        return
      }
      watchUrl.current = url
      setWatch({ id: video.id, week: video.week_start, url, error: '', loading: false })
    } catch (reason) {
      if (watchRequest.current !== request) return
      setWatch({
        id: video.id,
        week: video.week_start,
        url: null,
        loading: false,
        error: reason instanceof ApiError ? reason.message : t('log.filmOpenError'),
      })
    }
  }

  const counts = Object.entries(log?.counts ?? {}).flatMap(([kind, count]) =>
    count != null && count > 0 ? [{ kind, count }] : [],
  )
  const reportElapsed = makingReport ? Math.max(0, Math.floor((now - reportStarted.current) / 1000)) : 0
  const filmElapsed = active ? elapsedSince(active.created_at, now) : null

  return (
    <section aria-labelledby="dashboard-log" className="flex flex-col gap-3 p-1">
      <div>
        <h2 id="dashboard-log" className="font-serif text-lg text-ink">{t('log.thisWeek')}</h2>
        {log && log.total > 0 ? <p className="text-xs text-ink-soft">{formatInt(log.total)} {log.total === 1 ? 'record' : 'records'}</p> : null}
        <p className="sr-only" aria-live="polite">{log ? t('log.activityCount', { total: formatInt(log.total) }) : ''}</p>
      </div>
      {logError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hanko/30 bg-hanko/5 p-3 text-xs text-hanko">
          {logError}
          <button type="button" className="font-medium underline" onClick={() => reviseLog((value) => value + 1)}>{t('common.retry')}</button>
        </div>
      ) : null}
      {deleteError ? <p role="alert" className="text-xs text-hanko">{deleteError}</p> : null}
      {!log && !logError ? <div className="aqua-skel h-24 rounded-card" role="status" aria-label={t('log.loading')} /> : null}
      {counts.length ? (
        <ul aria-label={t('log.weekActivity')} className="flex flex-wrap gap-1">
          {counts.map((chip) => (
            <li key={chip.kind} className="rounded-full border border-line bg-paper px-2 py-0.5 text-[11px] text-ink">
              {KIND_LABEL[chip.kind] ?? chip.kind.replaceAll('_', ' ')} {formatInt(chip.count)}
            </li>
          ))}
        </ul>
      ) : null}
      {canWrite ? (
        <AddLogForm farmId={farmId} plots={plots} onAdded={() => reviseLog((value) => value + 1)} />
      ) : (
        <p className="text-xs text-ink-soft" title={t('log.addPermission')}>{t('common.readOnly')}</p>
      )}
      {log && log.items.length === 0 ? <p className="rounded-card border border-line bg-cream px-3 py-4 text-center text-sm text-ink-soft">{t('log.empty')}</p> : null}
      {log && log.items.length > 0 ? (
        <div className="grid gap-3">
          {log.total > log.items.length ? (
            <p className="text-[11px] text-ink-soft">{t('dashboard.logShowing')}{' '} {formatInt(log.items.length)} of {formatInt(log.total)}.</p>
          ) : null}
          {groupByDay(log.items).map((group) => (
            <section key={group.key || group.label} aria-label={group.label}>
              <h3 className="text-[11px] text-ink-soft [font-variant:all-small-caps]">{group.label}</h3>
              <ul className="mt-1 grid gap-2">
                {group.items.map((item) => {
                  const Icon = KIND_ICON[item.kind] ?? Circle
                  const when = Number.isFinite(Date.parse(item.at)) ? fullWhen().format(new Date(item.at)) : ''
                  return (
                    <li key={item.id} className={`min-w-0 rounded-card border px-2.5 py-2 ${item.source === 'manual' ? 'border-line bg-paper' : 'border-dashed border-line bg-cream'}`}>
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon size={15} className="mt-0.5 shrink-0 text-forest" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm leading-tight text-ink">
                            {item.title}
                            {item.source === 'manual' ? <PenLine size={12} className="ms-1 inline text-ink-soft" aria-hidden /> : null}
                            <span className="sr-only">{item.source === 'manual' ? t('log.writtenNote') : t('log.systemRecord')}</span>
                          </p>
                          {item.detail.trim() ? <p className="mt-0.5 break-words text-xs text-ink-soft">{item.detail}</p> : null}
                          <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-soft">
                            <span className="rounded-full bg-cream-deep px-1.5 py-0.5">{item.source === 'manual' ? t('dashboard.logWritten') : t('dashboard.logSystem')}</span>
                            {item.plot ? <span className="rounded-full border border-line px-1.5 py-0.5">{item.plot}</span> : null}
                            <AquaEstimate record={item} />
                          </p>
                          {item.source === 'manual' && item.entered_by ? (
                            <EnteredBy record={item} own={ownsNote(item, user)} />
                          ) : (
                            <p className="text-[11px] text-ink-soft">
                              {item.who ?? t('log.noAuthor')}
                              {' · '}
                              <time dateTime={item.at} title={when}>{formatRelative(item.at)}</time>
                            </p>
                          )}
                          {canRemove(item, user, role) && pendingDelete !== item.id ? (
                            <button type="button" disabled={deleting} onClick={() => { setDeleteError(''); setPendingDelete(item.id) }} className="mt-1 text-xs font-medium text-hanko underline disabled:opacity-60">
                              {t('common.delete')}
                            </button>
                          ) : null}
                          {pendingDelete === item.id ? (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span>{t('log.deleteNoteConfirm')}</span>
                              <button type="button" disabled={deleting} onClick={() => void remove(item)} className="rounded-full bg-forest-deep px-3 py-1 text-white disabled:opacity-60">
                                {deleting ? t('common.deleting') : t('log.deleteNote')}
                              </button>
                              <button type="button" disabled={deleting} onClick={() => setPendingDelete(null)} className="rounded-full border border-line px-3 py-1 disabled:opacity-60">{t('common.cancel')}</button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {canManage ? (
        <section aria-labelledby="dashboard-past-weeks" className="grid gap-2 rounded-card border border-line bg-paper p-3">
          <h3 id="dashboard-past-weeks" className="font-serif text-base text-ink">{t('log.pastWeeks')}</h3>
          <p className="text-xs text-ink-soft">{t('log.pastWeeksHelp')}</p>
          <ul className="grid gap-2">
            {pastWeekStarts().map((week) => {
              const hasPdf = reports?.some((report) => report.week_start === week)
              const hasFilm = videos?.some((video) => video.week_start === week && video.ready)
              return (
                <li key={week} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 break-words">{t('log.weekOf')}{' '} {formatWeek(week)}</span>
                  <button type="button" disabled={makingReport || busyFile != null} onClick={() => void pastPdf(week)} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-forest disabled:opacity-60">
                    {hasPdf ? t('log.pdf') : t('log.makePdf')}
                  </button>
                  <button type="button" disabled={makingVideo} onClick={() => void pastVideo(week)} className="rounded-full border border-line px-3 py-1 text-xs font-medium text-forest disabled:opacity-60">
                    {hasFilm ? t('log.watch') : t('log.makeFilm')}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="dashboard-weekly-report" className="grid gap-2 rounded-card border border-line bg-paper p-3">
        <h3 id="dashboard-weekly-report" className="font-serif text-base text-ink">{t('log.weeklyReport')}</h3>
        <p className="text-xs text-ink-soft">{t('log.reportSchedule')}</p>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={makingReport} onClick={() => void makeReport()} className="rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              {makingReport ? t('log.reportRunning') : reportError ? t('common.retry') : t('log.makeReport')}
            </button>
            {makingReport ? <p role="status" aria-live="polite" className="text-xs text-ink-soft">{t('log.reportElapsed', { seconds: formatInt(reportElapsed) })}</p> : null}
          </div>
        ) : (
          <p className="text-xs text-ink-soft" title={t('log.reportPermission')}>{t('common.readOnly')}</p>
        )}
        {reportNotice ? <p role="status" className="text-xs text-ink-soft">{reportNotice}</p> : null}
        {reportError ? <p role="alert" className="text-xs text-hanko">{reportError}</p> : null}
        {reportListError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-hanko">
            {reportListError}
            <button type="button" className="font-medium underline" onClick={() => void loadReports(new AbortController().signal)}>{t('common.retry')}</button>
          </div>
        ) : null}
        {!reports && !reportListError ? <div className="aqua-skel h-12 rounded-card" role="status" aria-label={t('log.loadingReports')} /> : null}
        {reports && reports.length === 0 ? <p className="text-xs text-ink-soft">{t('log.noReports')}</p> : null}
        {reports && reports.length > 0 ? (
          <ul className="grid gap-2">
            {reports.map((report) => (
              <li key={report.id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 break-words">{t('log.weekOf')}{' '} {formatWeek(report.week_start)}</span>
                <MoodChip mood={report.mood} score={report.score} />
                <button type="button" disabled={busyFile != null} onClick={() => void downloadReport(report)} className="text-xs font-medium text-forest underline disabled:opacity-60">
                  {busyFile === `report-${report.id}` ? t('common.downloading') : t('log.pdf')}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-labelledby="dashboard-weekly-video" className="grid gap-2 rounded-card border border-line bg-paper p-3">
        <h3 id="dashboard-weekly-video" className="font-serif text-base text-ink">{t('log.weeklyVideo')}</h3>
        <p className="text-xs text-ink-soft">{t('log.videoHelp')}</p>
        {canManage ? (
          <button type="button" disabled={makingVideo} onClick={() => void makeVideo()} className="w-fit rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            {makingVideo ? t('log.filmRunning') : videoError ? t('common.retry') : t('log.makeFilm')}
          </button>
        ) : (
          <p className="text-xs text-ink-soft" title={t('log.filmPermission')}>{t('common.readOnly')}</p>
        )}
        {makingVideo ? (
          <div role="status" aria-live="polite" className="grid gap-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-cream-deep" aria-hidden>
              <div className="aqua-brush h-full rounded-full bg-forest" />
            </div>
            <p className="text-xs text-ink-soft">
              {t('log.filmWait')}
              {filmElapsed == null ? t('log.noElapsed') : t('log.elapsed', { seconds: formatInt(filmElapsed) })}
            </p>
          </div>
        ) : null}
        {videoNotice ? <p role="status" className="text-xs text-ink-soft">{videoNotice}</p> : null}
        {videoError ? <p role="alert" className="text-xs text-hanko">{videoError}</p> : null}
        {videoListError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-xs text-hanko">
            {videoListError}
            <button type="button" className="font-medium underline" onClick={() => reviseVideos((value) => value + 1)}>{t('common.retry')}</button>
          </div>
        ) : null}
        {!videos && !videoListError ? <div className="aqua-skel h-12 rounded-card" role="status" aria-label={t('log.loadingFilms')} /> : null}
        {videos && videos.length === 0 ? <p className="text-xs text-ink-soft">{t('log.noFilms')}</p> : null}
        {videos && videos.length > 0 ? (
          <ul className="grid gap-2">
            {videos.map((video) => (
              <li key={video.id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 break-words">{t('log.weekOf')}{' '} {formatWeek(video.week_start)}</span>
                <MoodChip mood={video.mood} />
                <span className="text-[11px] text-ink-soft">{video.status === 'done' ? t('common.ready') : video.status === 'rendering' ? t('dashboard.logMaking') : video.status === 'queued' ? t('common.queued') : t('common.failed')}</span>
                {video.ready ? (
                  <>
                    <button type="button" onClick={() => void openWatch(video)} className="text-xs font-medium text-forest underline">{t('log.watch')}</button>
                    <button type="button" disabled={busyFile != null} onClick={() => void downloadVideo(video)} className="text-xs font-medium text-forest underline disabled:opacity-60">
                      {busyFile === `video-${video.id}` ? t('common.downloading') : t('common.download')}
                    </button>
                  </>
                ) : null}
                {video.status === 'failed' && video.error.trim() ? <span className="basis-full break-words text-xs text-hanko">{video.error}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        <AquaEstimate note={t('estimates.film')} />
      </section>
      {fileError ? <p role="alert" className="text-xs text-hanko">{fileError}</p> : null}
      {watch ? (
        <WatchDialog week={watch.week} url={watch.url} loading={watch.loading} error={watch.error} onClose={closeWatch} />
      ) : null}
    </section>
  )
}
