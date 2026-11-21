import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { TagInput } from '../TagInput'
import {
  ApiError,
  api,
  type Job,
  type JobBody,
  type JobKind,
  type JobPayMode,
  type JobPayUnit,
  type JobStatus,
  type MarketMeta,
} from '../../api'
import {
  JOB_KINDS,
  PAY_UNITS,
  dateInputValue,
  isJobPayUnit,
  isJobStatus,
} from './format'

const TITLE_MIN = 3
const TITLE_MAX = 120
const DESC_MAX = 2000
const ADDR_MAX = 200
const SKILL_MAX = 30
const SKILLS_MAX = 8

type JobFormDialogProps = {
  open: boolean
  farmId: number
  job: Job | null
  meta: MarketMeta | null
  farmRegion: string
  onClose: () => void
  onSaved: (job: Job) => void
}

function parseNumber(raw: string): number | null {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return Number.NaN
  return n
}

function parseIntInRange(raw: string, min: number, max: number): number | null {
  const n = parseNumber(raw)
  if (n == null || Number.isNaN(n)) return null
  const i = Math.round(n)
  if (i < min || i > max) return null
  return i
}

export function JobFormDialog({
  open,
  farmId,
  job,
  meta,
  farmRegion,
  onClose,
  onSaved,
}: JobFormDialogProps) {
  const titleId = useId()
  const nameId = useId()
  const startId = useId()
  const endId = useId()
  const amountId = useId()
  const unitId = useId()
  const neededId = useId()
  const skillsId = useId()
  const skillsHelpId = useId()
  const govId = useId()
  const addrId = useId()
  const descId = useId()
  const radiusId = useId()
  const radiusHelpId = useId()
  const statusId = useId()
  const kindLabelId = useId()
  const payLabelId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const editing = job != null
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<JobKind>('task')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [payMode, setPayMode] = useState<JobPayMode>('fixed')
  const [amount, setAmount] = useState('')
  const [unit, setUnit] = useState<JobPayUnit>('day')
  const [needed, setNeeded] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [governorate, setGovernorate] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [radiusKm, setRadiusKm] = useState('')
  const [status, setStatus] = useState<JobStatus>('open')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const metaRef = useRef(meta)
  metaRef.current = meta

  useEffect(() => {
    if (!open) return
    setErr('')
    setBusy(false)
    if (job) {
      setTitle(job.title)
      setKind(job.kind)
      setStart(dateInputValue(job.start_date))
      setEnd(dateInputValue(job.end_date))
      setPayMode(job.pay_mode)
      setAmount(job.pay_amount == null ? '' : String(job.pay_amount))
      setUnit(job.pay_unit ?? 'day')
      setNeeded(String(job.workers_needed))
      setSkills(job.skills.slice())
      setGovernorate(job.governorate)
      setAddress(job.address_text)
      setDescription(job.description)
      setRadiusKm(job.radius_km == null ? '' : String(job.radius_km))
      setStatus(job.status)
    } else {
      setTitle('')
      setKind('task')
      setStart('')
      setEnd('')
      setPayMode('fixed')
      setAmount('')
      setUnit('day')
      setNeeded('')
      setSkills([])
      const match = (metaRef.current?.governorates ?? []).find(
        (g) => g.name.localeCompare(farmRegion.trim(), undefined, { sensitivity: 'base' }) === 0,
      )
      setGovernorate(match?.name ?? '')
      setAddress('')
      setDescription('')
      setRadiusKm('')
      setStatus('open')
    }
  }, [open, job, farmRegion])

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

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = title.trim()
    if (trimmed.length < TITLE_MIN) {
      setErr(t('common.titleMinimum'))
      return
    }
    if (trimmed.length > TITLE_MAX) {
      setErr(t('common.titleLimit'))
      return
    }
    const startDate = start || null
    const endDate = kind === 'long_term' ? null : end || null
    if (kind === 'period' && (!startDate || !endDate)) {
      setErr(t('jobs.termDatesRequired'))
      return
    }
    if (startDate && endDate && endDate < startDate) {
      setErr(t('jobs.endBeforeStart'))
      return
    }
    let amountN: number | null = null
    let unitN: JobPayUnit | null = null
    if (payMode === 'fixed') {
      const n = parseNumber(amount)
      if (n == null || Number.isNaN(n) || n <= 0) {
        setErr(t('jobs.payRequired'))
        return
      }
      amountN = n
      unitN = unit
    }
    const neededN = parseIntInRange(needed, 1, 100)
    if (neededN == null) {
      setErr(t('jobs.workersRange'))
      return
    }
    if (skills.some((s) => !s.trim() || s.length > SKILL_MAX)) {
      setErr(t('profile.skillLimit'))
      return
    }
    if (!governorate) {
      setErr(t('common.governorateInvalid'))
      return
    }
    const addr = address.trim()
    if (addr.length > ADDR_MAX) {
      setErr(t('common.addressLimit'))
      return
    }
    const desc = description.trim()
    if (desc.length > DESC_MAX) {
      setErr(t('common.descriptionLimit'))
      return
    }
    if (skills.length > SKILLS_MAX) {
      setErr(t('jobs.skillCount'))
      return
    }
    let radiusN: number | null = null
    const radiusTrim = radiusKm.trim()
    if (radiusTrim !== '') {
      const n = parseIntInRange(radiusTrim, 1, 500)
      if (n == null) {
        setErr(t('jobs.reachRange'))
        return
      }
      radiusN = n
    }
    const body: JobBody = {
      title: trimmed,
      description: desc,
      kind,
      start_date: startDate,
      end_date: endDate,
      pay_mode: payMode,
      pay_amount: amountN,
      pay_unit: unitN,
      workers_needed: neededN,
      skills,
      governorate,
      address_text: addr,
      status: editing ? status : 'open',
      radius_km: radiusN,
    }
    setBusy(true)
    setErr('')
    try {
      const saved = job
        ? await api.updateFarmJob(farmId, job.id, body)
        : await api.createFarmJob(farmId, body)
      onSaved(saved)
      onClose()
    } catch (error) {
      setErr(
        error instanceof ApiError
          ? error.message
          : editing
            ? t('jobs.saveError')
            : t('jobs.publishError'),
      )
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const govs = meta?.governorates ?? []

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
        className="relative z-10 max-h-[90dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {editing ? t('jobs.edit') : t('jobs.post')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
        {job ? <EnteredBy record={job} /> : null}
          <Field label={t('common.title')} htmlFor={nameId}>
            <input
              id={nameId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={TITLE_MAX}
              minLength={TITLE_MIN}
              required
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
          <div>
            <p className="text-xs font-medium text-ink-soft" id={kindLabelId}>
              {t('common.type')}
            </p>
            <div
              role="group"
              aria-labelledby={kindLabelId}
              className="mt-1 inline-flex max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-sm"
            >
              {JOB_KINDS.map((k) => (
                <SegBtn
                  key={k.id}
                  pressed={kind === k.id}
                  onClick={() => {
                    setKind(k.id)
                    if (k.id === 'long_term') setEnd('')
                  }}
                  disabled={busy}
                >
                  {k.label}
                </SegBtn>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={kind === 'period' ? t('jobs.startDate') : t('jobs.startOptional')}
              htmlFor={startId}
            >
              <input
                id={startId}
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                required={kind === 'period'}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
            </Field>
            {kind === 'long_term' ? null : (
              <Field
                label={kind === 'period' ? t('jobs.endDate') : t('jobs.endOptional')}
                htmlFor={endId}
              >
                <input
                  id={endId}
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required={kind === 'period'}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                />
              </Field>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-ink-soft" id={payLabelId}>
              {t('jobs.pay')}
            </p>
            <div
              role="group"
              aria-labelledby={payLabelId}
              className="mt-1 inline-flex max-w-full flex-wrap items-center rounded-full border border-line bg-cream p-1 text-sm"
            >
              <SegBtn
                pressed={payMode === 'fixed'}
                onClick={() => setPayMode('fixed')}
                disabled={busy}
              >
                {t('jobs.fixed')}
              </SegBtn>
              <SegBtn
                pressed={payMode === 'negotiable'}
                onClick={() => setPayMode('negotiable')}
                disabled={busy}
              >
                {t('jobs.toAgree')}
              </SegBtn>
            </div>
            {payMode === 'fixed' ? (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label={t('jobs.amount')} htmlFor={amountId}>
                  <input
                    id={amountId}
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                  />
                </Field>
                <Field label={t('jobs.rateUnit')} htmlFor={unitId}>
                  <select
                    id={unitId}
                    value={unit}
                    onChange={(e) => {
                      const next = e.target.value
                      if (isJobPayUnit(next)) setUnit(next)
                    }}
                    disabled={busy}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                  >
                    {PAY_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            ) : null}
          </div>
          <Field label={t('jobs.workersNeeded')} htmlFor={neededId}>
            <input
              id={neededId}
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              value={needed}
              onChange={(e) => setNeeded(e.target.value)}
              required
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
          <div className="min-w-0">
            <label htmlFor={skillsId} className="text-xs font-medium text-ink-soft">
              {t('common.skills')}
            </label>
            <TagInput
              id={skillsId}
              tags={skills}
              onChange={setSkills}
              maxTags={SKILLS_MAX}
              maxLength={SKILL_MAX}
              disabled={busy}
              describedBy={skillsHelpId}
              fullTitle="You can add up to 8 skills"
              itemWord="skill"
              onError={setErr}
            />
            <p id={skillsHelpId} className="mt-1 text-xs text-ink-soft">
              {t('jobs.skillInputLimit')}
            </p>
          </div>
          <Field label={t('common.governorate')} htmlFor={govId}>
            <select
              id={govId}
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              required
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="">{t('common.chooseGovernorate')}</option>
              {govs.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('jobs.address')} htmlFor={addrId}>
            <input
              id={addrId}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={ADDR_MAX}
              disabled={busy}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
          </Field>
          <Field label={t('jobs.distance')} htmlFor={radiusId}>
            <input
              id={radiusId}
              type="number"
              min={1}
              max={500}
              step={1}
              inputMode="numeric"
              value={radiusKm}
              onChange={(e) => setRadiusKm(e.target.value)}
              disabled={busy}
              aria-describedby={radiusHelpId}
              className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p id={radiusHelpId} className="mt-1 text-xs text-ink-soft">
              {t('jobs.distanceHelp')}
            </p>
          </Field>
          <Field label={t('common.description')} htmlFor={descId}>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={4}
              disabled={busy}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p className="mt-1 text-end text-xs text-ink-soft">
              {description.length}/{DESC_MAX}
            </p>
          </Field>
          {editing ? (
            <Field label={t('common.status')} htmlFor={statusId}>
              <select
                id={statusId}
                value={status}
                onChange={(e) => {
                  const next = e.target.value
                  if (isJobStatus(next)) setStatus(next)
                }}
                disabled={busy}
                className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              >
                <option value="open">{t('common.open')}</option>
                <option value="filled">{t('jobs.filled')}</option>
                <option value="closed">{t('common.closed')}</option>
              </select>
            </Field>
          ) : null}
          {err ? (
            <p className="text-sm text-hanko" role="alert">
              {err}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-line px-4 py-2 text-sm"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy
                ? editing
                  ? t('common.saving')
                  : t('common.publishing')
                : editing
                  ? t('common.saveChanges')
                  : t('jobs.publish')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      {children}
    </div>
  )
}

function SegBtn({
  pressed,
  onClick,
  disabled,
  children,
}: {
  pressed: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 ${
        pressed ? 'bg-white text-ink shadow-shell' : 'text-ink-soft'
      }`}
    >
      {children}
    </button>
  )
}
