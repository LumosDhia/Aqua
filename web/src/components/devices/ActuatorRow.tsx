import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Pencil, Play, Square } from 'lucide-react'
import { ApiError, api, type Actuator } from '../../api'
import { CommandNote, useDeviceCommand } from './CommandNote'
import {
  actuatorMeta,
  actuatorRunOptions,
  formatCountdown,
  pickDefaultDuration,
  remainingSeconds,
} from './format'

export function ActuatorRow({
  farmId,
  deviceId,
  actuator,
  online,
  canControl,
  canManage,
  local,
  autoMode,
  now,
  onPatched,
  onSettled,
}: {
  farmId: number
  deviceId: number
  actuator: Actuator
  online: boolean
  canControl: boolean
  canManage: boolean
  local: boolean
  autoMode: boolean
  now: number
  onPatched: (next: Actuator) => void
  onSettled: () => void
}) {
  const runId = useId()
  const meta = actuatorMeta(actuator.kind)
  const Icon = meta.Icon
  const options = actuatorRunOptions(actuator)
  const [duration, setDuration] = useState(() => pickDefaultDuration(actuator, options))
  const [editing, setEditing] = useState(false)
  const { note, sending, execute, resetNote } = useDeviceCommand()
  const durationsKey = actuator.durations?.join(',') ?? '-'

  useEffect(() => {
    resetNote()
    setEditing(false)
    setDuration(pickDefaultDuration(actuator, actuatorRunOptions(actuator)))
  }, [actuator.id, resetNote])

  useEffect(() => {
    const next = actuatorRunOptions(actuator)
    if (!next.some((o) => o.seconds === duration)) {
      setDuration(pickDefaultDuration(actuator, next))
    }
  }, [actuator.max_run_s, durationsKey, duration])

  const remain = remainingSeconds(actuator.on_until, now)
  const on = actuator.state === 'on' && (local || remain !== 0)
  const countdown = !local && on && actuator.on_until && remain !== 0 ? formatCountdown(actuator.on_until, now) : ''
  const noDur = options.length === 0
  const blocked = !canControl || !online || sending
  const auto = local && autoMode
  const startBlocked = blocked || noDur || auto
  const stopBlocked = !canControl || (!local && (sending || !online))
  const startTitle = !canControl
    ? t('dashboard.permissionControl')
    : !online
      ? t('devices.offlineSentence')
      : sending
        ? t('devices.sending')
        : auto
          ? t('devices.autoRefusal')
          : noDur
            ? t('devices.noRunTime')
            : undefined
  const controlTitle = !canControl
    ? t('dashboard.permissionControl')
    : !local && !online
      ? t('devices.offlineSentence')
      : !local && sending
        ? t('devices.sending')
        : !local && !on && noDur
          ? t('devices.noRunTime')
          : undefined

  function send(action: 'on' | 'off') {
    if (action === 'off' && stopBlocked) return
    if (action === 'on' && (startBlocked || !options.some((option) => option.seconds === duration))) return
    void execute({
      farmId,
      deviceId,
      actuatorId: actuator.id,
      action,
      duration_s: action === 'on' ? duration : undefined,
      local,
      onSettled,
    })
  }

  return (
    <li className="min-w-0 border-t border-line py-2 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-forest"
          aria-hidden
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{actuator.label}</p>
          <EnteredBy record={actuator} />
        </div>
        {!local && (on ? (
          <span
            className="aqua-glow inline-flex shrink-0 items-center gap-1.5 rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest"
            title={countdown || t('common.on')}
          >
            {t('devices.onUpper')}
            {countdown ? <span className="font-sans font-normal">{countdown}</span> : null}
          </span>
        ) : (
          <span className="inline-flex shrink-0 rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {t('devices.offUpper')}
          </span>
        ))}
        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label={t('common.editNamed', { name: actuator.label })}
            title={t('common.editNamed', { name: actuator.label })}
            className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-forest"
          >
            <Pencil size={14} aria-hidden />
          </button>
        ) : null}
      </div>

      {canManage && editing ? (
        <ActuatorEditor
          farmId={farmId}
          deviceId={deviceId}
          actuator={actuator}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false)
            onPatched(next)
          }}
        />
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {local || !on ? (
          <>
            <label className="sr-only" htmlFor={runId}>
              {t('devices.runTime')}{' '} {actuator.label}
            </label>
            <select
              id={runId}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={startBlocked}
              title={startTitle}
              className="min-w-[7rem] max-w-full rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink disabled:opacity-60"
            >
              {options.map((o) => (
                <option key={o.seconds} value={o.seconds}>
                  {o.label}
                </option>
              ))}
            </select>
            <span title={startTitle} className="inline-flex min-w-0">
              <button
                type="button"
                onClick={() => send('on')}
                disabled={startBlocked}
                title={startTitle}
                className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                <Play size={14} aria-hidden />
                {local ? t('devices.waterNow') : t('common.start')}
              </button>
            </span>
          </>
        ) : null}
        {local || on ? (
          <span title={controlTitle} className="inline-flex min-w-0">
            <button
              type="button"
              onClick={() => send('off')}
              disabled={stopBlocked}
              title={controlTitle}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${local ? 'bg-hanko' : 'bg-forest-deep'}`}
            >
              <Square size={14} aria-hidden />
              {local ? t('devices.stopPump') : t('devices.stop')}
            </button>
          </span>
        ) : null}
      </div>

      {note ? <CommandNote note={note} /> : null}
    </li>
  )
}

function ActuatorEditor({
  farmId,
  deviceId,
  actuator,
  onCancel,
  onSaved,
}: {
  farmId: number
  deviceId: number
  actuator: Actuator
  onCancel: () => void
  onSaved: (next: Actuator) => void
}) {
  const labelId = useId()
  const runId = useId()
  const errId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const [label, setLabel] = useState(actuator.label)
  const [minutes, setMinutes] = useState(String(Math.max(1, Math.round(actuator.max_run_s / 60))))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancelRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) {
      setErr(t('devices.labelRequired'))
      return
    }
    if (trimmed.length > 80) {
      setErr(t('devices.labelLimit'))
      return
    }
    const mins = Math.round(Number(minutes))
    if (!Number.isFinite(mins) || mins < 1) {
      setErr(t('devices.longestRunRequired'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const next = await api.updateActuator(farmId, deviceId, actuator.id, {
        label: trimmed,
        max_run_s: mins * 60,
      })
      onSaved(next)
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('devices.outputSaveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mt-2 space-y-2" onSubmit={onSave} aria-label={t('common.editNamed', { name: actuator.label })}>
    <EnteredBy record={actuator} />
      <div>
        <label htmlFor={labelId} className="text-xs font-medium text-ink-soft">
          {t('devices.label')}
        </label>
        <input
          id={labelId}
          ref={inputRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={80}
          disabled={busy}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? errId : undefined}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        />
      </div>
      <div>
        <label htmlFor={runId} className="text-xs font-medium text-ink-soft">
          {t('devices.longestRun')}
        </label>
        <input
          id={runId}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          disabled={busy}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        />
      </div>
      {err ? (
        <p id={errId} className="text-sm text-hanko" role="alert">
          {err}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-line px-3 py-1 text-xs disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
