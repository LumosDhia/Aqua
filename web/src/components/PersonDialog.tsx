import { t } from '../i18n'
import { EnteredBy } from './EnteredBy'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import { ApiError, api, type PublicCv, type PublicProfile } from '../api'
import { Portrait } from './Portrait'
import { FarmNotice } from './FarmNotice'
import { CvPreview } from './CvPreview'
import { JOB_KINDS } from './jobs/format'
import { Chip } from './market/Chip'
import { ReportButton } from './reports/ReportButton'
import { engagementDates } from './workers/engagement'

type PersonDialogProps = {
  open: boolean
  userId: number | null
  engagementId?: number | null
  onClose: () => void
}

function accountTypeLabel(type: PublicProfile['account_type']): string {
  return type === 'farmer' ? t('farm.farmer') : t('shell.worker')
}

function kindLabels(kinds: PublicProfile['kinds']): string[] {
  return JOB_KINDS.filter((k) => kinds.includes(k.id)).map((k) => k.label)
}

export function PersonDialog({ open, userId, engagementId, onClose }: PersonDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [cv, setCv] = useState<PublicCv | null>(null)
  const [ready, setReady] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [privateOrMissing, setPrivateOrMissing] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    if (!open) return
    setProfile(null)
    setCv(null)
    setReady(false)
    setLoadErr('')
    setPrivateOrMissing(false)
  }, [open, userId])

  useEffect(() => {
    if (!open || userId == null) return
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current
    setReady(false)
    setLoadErr('')
    setPrivateOrMissing(false)

    const id = userId
    async function load() {
      const [pR, cR] = await Promise.allSettled([api.publicProfile(id), api.publicCv(id)])
      if (cancelled || my !== seqRef.current) return
      if (pR.status === 'fulfilled') {
        setProfile(pR.value)
        setPrivateOrMissing(false)
        setLoadErr('')
      } else {
        setProfile(null)
        const reason = pR.reason
        if (reason instanceof ApiError && reason.status === 404) {
          setPrivateOrMissing(true)
          setLoadErr('')
        } else {
          setPrivateOrMissing(false)
          setLoadErr(reason instanceof ApiError ? reason.message : t('members.profileError'))
        }
      }
      if (cR.status === 'fulfilled' && cR.value.cv) {
        setCv(cR.value)
      } else {
        setCv(null)
      }
      setReady(true)
    }

    void load()
    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [open, userId])

  useEffect(() => {
    if (!open) return
    const root = panelRef.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pick = () =>
      root
        ? [
            ...root.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ]
        : []
    const first = pick()[0]
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const els = pick()
      if (els.length === 0) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault()
          els[els.length - 1]?.focus()
        }
      } else if (i === els.length - 1) {
        e.preventDefault()
        els[0]?.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open])

  if (!open) return null

  const kinds = profile ? kindLabels(profile.kinds) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest-deep/45"
        aria-label={t('common.closeDialog')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell"
      >
        {profile?.demo ? <FarmNotice /> : null}
        <div className="flex shrink-0 items-start justify-between gap-3 px-6 pt-6">
          <h2 id={titleId} className="min-w-0 font-serif text-2xl text-ink">
            {profile?.name ?? t('shell.profile')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="page-scroll min-h-0 flex-1 px-6 py-4">
          {!ready ? (
            <div className="space-y-3" aria-hidden>
              <div className="flex items-center gap-3">
                <div className="aqua-skel h-11 w-11 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="aqua-skel h-5 w-1/2 rounded" />
                  <div className="aqua-skel h-3 w-1/3 rounded" />
                </div>
              </div>
              <div className="aqua-skel h-20 w-full rounded" />
            </div>
          ) : loadErr ? (
            <p className="text-sm text-hanko" role="alert">
              {loadErr}
            </p>
          ) : privateOrMissing ? (
            <p className="text-sm text-ink-soft" role="status">
              {t('members.private')}
            </p>
          ) : profile ? (
            <div className="space-y-4">
              <div className="flex min-w-0 items-center gap-3">
                <Portrait name={profile.name} photo={profile.photo} size="md" />
                <div className="min-w-0">
                  <p className="truncate font-serif text-lg leading-tight text-ink">{profile.name}</p>
                  <p className="truncate text-sm text-ink-soft">
                    {profile.headline.trim() || t('common.noHeadline')}
                  </p>
                </div>
              </div>
              <EnteredBy record={profile} />
              <p className="text-sm text-ink">{profile.governorate || t('common.locationMissing')}</p>
              <div className="flex flex-wrap gap-1.5">
                <Chip className="bg-cream-deep text-ink">{accountTypeLabel(profile.account_type)}</Chip>
                {profile.looking_for_work ? (
                  <Chip className="bg-leaf-soft/70 text-forest">{t('common.lookingForWork')}</Chip>
                ) : null}
                {kinds.map((k) => (
                  <Chip key={k}>{k}</Chip>
                ))}
              </div>
              {profile.skills.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-ink-soft">{t('common.skills')}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {profile.skills.map((s, i) => (
                      <Chip key={`${s}-${i}`}>{s}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}
              {profile.languages.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-ink-soft">{t('common.languages')}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {profile.languages.map((s, i) => (
                      <Chip key={`${s}-${i}`}>{s}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}
              {profile.availability.trim() ? (
                <div>
                  <p className="text-xs font-medium text-ink-soft">{t('profile.availability')}</p>
                  <p className="mt-1 text-sm text-ink">{profile.availability}</p>
                </div>
              ) : null}
              {profile.bio.trim() ? (
                <div>
                  <p className="text-xs font-medium text-ink-soft">{t('common.about')}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm break-words text-ink">
                    {profile.bio}
                  </p>
                </div>
              ) : null}
              <ProfileWorkHistory profile={profile} />
              {cv?.cv ? (
                <div>
                  <p className="text-xs font-medium text-ink-soft">{t('shell.cv')}</p>
                  <div className="mt-2">
                    <EnteredBy record={cv} />
                    <CvPreview cv={cv.cv} name={profile.name} photo={profile.photo} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-6 py-4">
          {userId != null ? (
            <ReportButton
              targetUserId={userId}
              targetName={profile?.name ?? t('reports.person')}
              engagementId={engagementId}
            />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-full border border-line px-4 py-2 text-sm"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProfileWorkHistory({ profile }: { profile: PublicProfile }) {
  const worksAt = profile.works_at ?? []
  const verified = profile.verified_work ?? []
  if (worksAt.length === 0 && verified.length === 0) return null

  return (
    <div className="space-y-4">
      {worksAt.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {worksAt.map((w, i) => (
            <Chip key={`${w.farm}-${w.title}-${i}`} className="bg-leaf-soft/70 text-forest">
              <span className="min-w-0 break-words">{t('members.worksAt')}{' '} {w.farm}<EnteredBy record={w} /></span>
            </Chip>
          ))}
        </div>
      ) : null}
      {verified.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-ink-soft">{t('members.verified')}</p>
          <ul className="mt-2 space-y-2">
            {verified.map((w, i) => {
              const dates = engagementDates(w.start_date, w.end_date)
              const note = w.note.trim()
              return (
                <li
                  key={`${w.farm}-${w.title}-${w.start_date ?? ''}-${i}`}
                  data-card=""
                  className="min-w-0 rounded-xl border border-line bg-white p-2.5"
                >
                  <p className="truncate font-medium text-ink">{w.title}</p>
                  <EnteredBy record={w} />
                  <p className="truncate text-xs text-ink-soft">{w.farm}</p>
                  {dates ? <p className="mt-1 text-xs text-ink-soft">{dates}</p> : null}
                  {note ? (
                    <p className="mt-1 text-sm break-words text-ink">{note}</p>
                  ) : null}
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-forest">
                    <Check size={12} aria-hidden />
                    {t('members.confirmed')}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
