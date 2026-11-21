import { t } from '../../i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import {
  ApiError,
  api,
  canManageJobs,
  type Job,
  type PublicCv,
  type PublicProfile,
} from '../../api'
import { Portrait } from '../Portrait'
import { EnteredBy } from '../EnteredBy'
import { CvPreview } from '../CvPreview'
import { Chip } from '../market/Chip'
import { JOB_KINDS } from '../jobs/format'
import { messagesHref } from '../../lib/view'

type PersonProfileDialogProps = {
  open: boolean
  userId: number | null
  farmId: number | null
  role: string
  worksAt: { farm_id: number; farm: string; title: string; accessible: boolean } | null
  onClose: () => void
  onSeeFarm: (farmId: number) => void
}

function kindLabels(kinds: PublicProfile['kinds']): string[] {
  return JOB_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.label)
}

export function PersonProfileDialog({
  open,
  userId,
  farmId,
  role,
  worksAt,
  onClose,
  onSeeFarm,
}: PersonProfileDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [cv, setCv] = useState<PublicCv | null>(null)
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [actionErr, setActionErr] = useState('')
  const [actionNote, setActionNote] = useState('')
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [hiring, setHiring] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || userId == null) return
    const seq = userId
    setReady(false)
    setLoadErr('')
    setActionErr('')
    setActionNote('')
    setJobs(null)
    setHiring(false)
    void (async () => {
      try {
        const [next, nextCv] = await Promise.all([
          api.publicProfile(userId),
          api.publicCv(userId).catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 404) return null
            throw e
          }),
        ])
        if (seq !== userId) return
        setProfile(next)
        setCv(nextCv)
      } catch (e) {
        if (seq !== userId) return
        setProfile(null)
        setCv(null)
        setLoadErr(e instanceof ApiError ? e.message : t('members.profileError'))
      } finally {
        if (seq === userId) setReady(true)
      }
    })()
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    panel?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const els = [...panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.hasAttribute('disabled'),
      )
      if (els.length === 0) return
      const first = els[0]
      const last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open])

  if (!open || userId == null) return null

  const canHire = canManageJobs(role) && Boolean(profile?.looking_for_work) && farmId != null
  const kinds = profile ? kindLabels(profile.kinds) : []

  async function message() {
    if (farmId == null || !profile) return
    setActionErr('')
    setActionNote('')
    setBusy(true)
    try {
      const engagements = await api.farmEngagements(farmId)
      const hit = engagements.find((row) => row.worker?.id === profile.user_id)
      if (!hit) {
        setActionNote(t('members.waitToMessage'))
        return
      }
      window.location.hash = messagesHref(hit.id)
      onCloseRef.current()
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : t('members.messageError'))
    } finally {
      setBusy(false)
    }
  }

  async function loadJobs() {
    if (farmId == null) return
    setActionErr('')
    setHiring(true)
    try {
      const list = await api.farmJobs(farmId)
      setJobs(list.filter((job) => job.status === 'open'))
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : t('jobs.loadOwnJobsError'))
    }
  }

  async function invite(jobId: number) {
    if (farmId == null || !profile) return
    setBusy(true)
    setActionErr('')
    try {
      await api.inviteWorker(farmId, jobId, {
        user_id: profile.user_id,
        message: t('members.inviteText', { name: profile.name }),
      })
      setActionNote(t('members.inviteSent'))
      setHiring(false)
    } catch (e) {
      setActionErr(e instanceof ApiError ? e.message : t('members.inviteError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-forest-deep/45" aria-label={t('common.closeDialog')} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
          <h2 id={titleId} className="min-w-0 font-serif text-2xl text-ink">
            {profile?.name ?? t('shell.profile')}
          </h2>
          <button type="button" onClick={onClose} className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="page-scroll min-h-0 flex-1 px-4 py-4 sm:px-6">
          {!ready ? (
            <div className="space-y-3" aria-hidden>
              <div className="aqua-skel h-16 w-full rounded" />
              <div className="aqua-skel h-24 w-full rounded" />
            </div>
          ) : loadErr ? (
            <p className="text-sm text-hanko" role="alert">{loadErr}</p>
          ) : profile ? (
            <div className="min-w-0 space-y-4">
              <div className="flex min-w-0 items-center gap-3">
                <Portrait name={profile.name} photo={profile.photo} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg text-ink">{profile.name}</p>
                  <p className="truncate text-sm text-ink-soft">{profile.headline.trim() || t('common.noHeadline')}</p>
                </div>
              </div>
              {profile.bio.trim() ? <p className="whitespace-pre-wrap break-words text-sm text-ink">{profile.bio}</p> : null}
              <p className="text-sm text-ink">
                {profile.governorate.trim() || t('common.noGovernorate')}
                {profile.radius_km ? ` · travels ${profile.radius_km} km` : ''}
              </p>
              <div className="flex min-w-0 flex-wrap gap-1">
                {profile.skills.map((skill) => <Chip key={skill}>{skill}</Chip>)}
                {profile.languages.map((language) => (
                  <Chip key={language} className="bg-leaf-soft/70 text-forest">{language}</Chip>
                ))}
                {kinds.map((label) => <Chip key={label}>{label}</Chip>)}
                {profile.availability.trim() ? <Chip>{profile.availability}</Chip> : null}
                {profile.looking_for_work ? <Chip className="bg-forest text-paper">{t('common.lookingForWork')}</Chip> : null}
              </div>
              {profile.works_at.length > 0 ? (
                <div>
                  <h3 className="font-serif text-lg text-ink">{t('members.worksAt')}</h3>
                  <ul className="mt-1 space-y-1 text-sm text-ink">
                    {profile.works_at.map((row) => (
                      <li key={`${row.farm}-${row.title}`}>{row.title} at {row.farm}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <EnteredBy record={profile} verb="Recorded" />
              {cv?.cv ? <CvPreview cv={cv.cv} name={profile.name} photo={profile.photo} /> : (
                <p className="text-sm text-ink-soft">{t('members.noCv')}</p>
              )}
              {actionErr ? <p className="text-sm text-hanko" role="alert">{actionErr}</p> : null}
              {actionNote ? <p className="text-sm text-ink" role="status">{actionNote}</p> : null}
              {hiring && jobs ? (
                jobs.length === 0 ? (
                  <p className="text-sm text-ink-soft">{t('members.postToInvite')}</p>
                ) : (
                  <ul className="space-y-2">
                    {jobs.map((job) => (
                      <li key={job.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void invite(job.id)}
                          className="w-full rounded-card border border-line px-3 py-2 text-start text-sm text-ink hover:bg-cream disabled:opacity-60"
                        >
                          {t('members.inviteTo')}{' '} {job.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-soft" role="status">{t('members.private')}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-line px-4 py-3 sm:px-6">
          <button type="button" disabled={busy || !profile} onClick={() => void message()} className="rounded-full bg-forest px-4 py-2 text-sm text-paper disabled:opacity-60">
            {t('common.message')}
          </button>
          {canHire ? (
            <button type="button" disabled={busy} onClick={() => void loadJobs()} className="rounded-full border border-line px-4 py-2 text-sm text-ink">
              {t('members.invite')}
            </button>
          ) : null}
          {worksAt?.accessible ? (
            <button type="button" onClick={() => onSeeFarm(worksAt.farm_id)} className="rounded-full border border-line px-4 py-2 text-sm text-ink">
              {t('members.farmLink')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
