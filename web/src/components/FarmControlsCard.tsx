import { t } from '../i18n'
import { useEffect, useId, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ArrowRight, Play, Square } from 'lucide-react'
import {
  canControlDevices,
  canManageDevices,
  type Actuator,
  type Device,
} from '../api'
import { VIEW_HREF } from '../lib/view'
import { BoardModeSwitch, PresenceChip } from './devices/BoardControls'
import { useDeviceCommand } from './devices/CommandNote'
import {
  actuatorRunOptions,
  deviceAutoMode,
  devicesWithOutputs,
  formatCountdown,
  lastSeenLine,
  pickDefaultDuration,
  remainingSeconds,
} from './devices/format'

type FarmControlsCardProps = {
  farmId: number | null
  role: string
  devices: Device[]
  setDevices: Dispatch<SetStateAction<Device[]>>
  onSettled: () => void
}

const strip =
  '@container min-w-0 shrink-0 rounded-card border border-line bg-cream p-3 lg:py-2'

function primaryActuator(device: Device): Actuator | null {
  return device.actuators.find((a) => a.kind === 'pump') ?? device.actuators[0] ?? null
}

export function FarmControlsCard({
  farmId,
  role,
  devices,
  setDevices,
  onSettled,
}: FarmControlsCardProps) {
  const selectId = useId()
  const canControl = canControlDevices(role)
  const canManage = canManageDevices(role)
  const withOutputs = useMemo(() => devicesWithOutputs(devices), [devices])
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const { note, sending, execute, resetNote } = useDeviceCommand()

  const selected =
    withOutputs.find((d) => d.id === pickedId) ?? withOutputs[0] ?? devices[0] ?? null
  const actuator = selected ? primaryActuator(selected) : null
  const anyOn = devices.some((d) => d.actuators.some((a) => a.state === 'on'))

  useEffect(() => {
    if (!anyOn) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [anyOn])

  useEffect(() => {
    resetNote()
  }, [farmId, selected?.id, resetNote])

  function upsert(next: Device) {
    setDevices((list) => {
      const i = list.findIndex((d) => d.id === next.id)
      if (i === -1) return [next, ...list]
      const copy = list.slice()
      copy[i] = next
      return copy
    })
  }

  if (selected == null) return null

  const dataStatus = (selected.status_text ?? '').trim() || (selected.data?.status ?? '').trim()
  const local = selected.connection === 'local'
  const autoMode = deviceAutoMode(selected)
  const online = selected.online
  const statusText = note
    ? note.kind === 'sending'
      ? t('devices.sending')
      : note.text
    : dataStatus
  const deviceAlarm = note == null && selected.alarm
  const statusAlarm =
    note != null
      ? note.kind === 'fail' || note.kind === 'error'
      : selected.alarm
  const statusSending = note?.kind === 'sending'
  const statusWait = note?.kind === 'wait'
  const midMessage = !online
    ? lastSeenLine(selected.last_seen) === 'never'
      ? t('devices.offlineSentence')
      : t('devices.offlineWithDetails', { detail: lastSeenLine(selected.last_seen) })
    : actuator == null
      ? t('dashboard.noOutputs')
      : null

  return (
    <article data-card="" aria-label={t('dashboard.controls')} className={strip}>
      <div className="flex min-w-0 flex-col gap-2 @[36rem]:flex-row @[36rem]:flex-wrap @[36rem]:items-center">
        <div className="flex min-w-0 flex-wrap items-center gap-2 @[36rem]:flex-[1_1_14rem]">
          {withOutputs.length > 1 ? (
            <>
              <label htmlFor={selectId} className="sr-only">
                {t('devices.device')}
              </label>
              <select
                id={selectId}
                value={selected.id}
                onChange={(e) => setPickedId(Number(e.target.value))}
                className="w-[6.5rem] shrink-0 rounded-full border border-line bg-white px-2 py-1 text-xs text-ink @[36rem]:w-[7.5rem]"
              >
                {withOutputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <p
              className="max-w-[6.5rem] shrink-0 truncate font-serif text-sm leading-tight text-ink @[36rem]:max-w-[8rem]"
              title={selected.name}
            >
              {selected.name}
            </p>
          )}
          <PresenceChip online={online} />
          {online && (statusText || deviceAlarm || statusSending) ? (
            <p
              role={statusAlarm || deviceAlarm ? 'alert' : 'status'}
              title={deviceAlarm ? (statusText ? t('devices.alarm', { message: statusText }) : t('devices.alarmLabel')) : statusText}
              className={`min-w-0 flex-1 break-words text-xs ${
                statusAlarm || deviceAlarm
                  ? 'text-hanko'
                  : statusSending
                    ? 'text-ink-soft'
                    : statusWait
                      ? 'text-ochre'
                      : 'text-forest'
              }`}
            >
              {statusSending ? (
                <>
                  <span className="aqua-spin me-1.5 inline-block align-middle" aria-hidden />
                  {statusText}
                </>
              ) : deviceAlarm ? (
                statusText ? t('devices.alarm', { message: statusText }) : t('devices.alarmLabel')
              ) : (
                statusText
              )}
            </p>
          ) : null}
        </div>

        {midMessage ? (
          <p
            className="min-w-0 flex-1 break-words text-sm text-ink-soft"
            title={midMessage}
          >
            {midMessage}
          </p>
        ) : local && farmId != null ? (
          <div className="shrink-0">
            <BoardModeSwitch
              farmId={farmId}
              device={selected}
              canControl={canManage}
              onDevice={upsert}
              compact
            />
          </div>
        ) : null}

        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {online && farmId != null && actuator != null ? (
            <CompactOutput
              actuator={actuator}
              online={online}
              canControl={canControl}
              local={local}
              autoMode={autoMode}
              now={now}
              sending={sending}
              onRun={(action, duration_s) => {
                void execute({
                  farmId,
                  deviceId: selected.id,
                  actuatorId: actuator.id,
                  action,
                  duration_s,
                  local,
                  onSettled,
                })
              }}
            />
          ) : null}
          <a
            href={VIEW_HREF.devices}
            aria-label={t('devices.all')}
            title={t('devices.all')}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-forest"
          >
            <span className="hidden @[36rem]:inline">{t('devices.all')}</span>
            <ArrowRight className="rtl:-scale-x-100" size={14} aria-hidden />
          </a>
        </div>
      </div>
    </article>
  )
}

function CompactOutput({
  actuator,
  online,
  canControl,
  local,
  autoMode,
  now,
  sending,
  onRun,
}: {
  actuator: Actuator
  online: boolean
  canControl: boolean
  local: boolean
  autoMode: boolean
  now: number
  sending: boolean
  onRun: (action: 'on' | 'off', duration_s?: number) => void
}) {
  const runId = useId()
  const options = actuatorRunOptions(actuator)
  const [duration, setDuration] = useState(() => pickDefaultDuration(actuator, options))
  const durationsKey = actuator.durations?.join(',') ?? '-'

  useEffect(() => {
    setDuration(pickDefaultDuration(actuator, actuatorRunOptions(actuator)))
  }, [actuator.id])

  useEffect(() => {
    const next = actuatorRunOptions(actuator)
    if (!next.some((o) => o.seconds === duration)) {
      setDuration(pickDefaultDuration(actuator, next))
    }
  }, [actuator.max_run_s, durationsKey, duration])

  const remain = remainingSeconds(actuator.on_until, now)
  const on = actuator.state === 'on' && (local || remain !== 0)
  const countdown = on && actuator.on_until && remain !== 0 ? formatCountdown(actuator.on_until, now) : ''
  const noDur = options.length === 0
  const blocked = !canControl || !online || sending
  const auto = local && autoMode
  const startBlocked = blocked || noDur || auto
  const startTitle = !canControl
    ? t('dashboard.permissionControl')
    : !online
      ? t('devices.offlineSentence')
      : sending
        ? t('devices.sending')
        : auto
          ? t('devices.manualRequired')
          : noDur
            ? t('devices.noRunTime')
            : undefined
  const controlTitle = !canControl
    ? t('dashboard.permissionControl')
    : !online
      ? t('devices.offlineSentence')
      : sending
        ? t('devices.sending')
        : !on && noDur
          ? t('devices.noRunTime')
          : undefined

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {on ? (
        <>
          {countdown ? (
            <span className="whitespace-nowrap text-[11px] font-medium text-forest" title={countdown}>
              {countdown}
            </span>
          ) : null}
          <span title={controlTitle} className="inline-flex">
            <button
              type="button"
              onClick={() => onRun('off')}
              disabled={blocked}
              title={controlTitle}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              <Square size={14} aria-hidden />
              {t('devices.stop')}
            </button>
          </span>
        </>
      ) : (
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
            className="min-w-[4.5rem] max-w-[7rem] rounded-full border border-line bg-white px-2 py-1 text-xs text-ink disabled:opacity-60 @[36rem]:min-w-[5.5rem]"
          >
            {options.map((o) => (
              <option key={o.seconds} value={o.seconds}>
                {o.label}
              </option>
            ))}
          </select>
          <span title={startTitle} className="inline-flex">
            <button
              type="button"
              onClick={() => {
                if (startBlocked || !options.some((option) => option.seconds === duration)) return
                onRun('on', duration)
              }}
              disabled={startBlocked}
              title={startTitle}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
            >
              <Play size={14} aria-hidden />
              {t('devices.waterNow')}
            </button>
          </span>
        </>
      )}
    </div>
  )
}
