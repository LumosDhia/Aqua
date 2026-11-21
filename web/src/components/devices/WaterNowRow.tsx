import { t } from '../../i18n'
import { useEffect, useId, useState } from 'react'
import { Play } from 'lucide-react'
import type { Actuator, Device } from '../../api'
import { CommandNote, useDeviceCommand } from './CommandNote'
import {
  actuatorRunOptions,
  deviceAutoMode,
  pickDefaultDuration,
  shortestRunSeconds,
} from './format'

export function WaterNowRow({
  farmId,
  device,
  actuator,
  canControl,
  pick = 'select',
  onSettled,
}: {
  farmId: number
  device: Device
  actuator: Actuator
  canControl: boolean
  pick?: 'select' | 'shortest'
  onSettled: () => void
}) {
  const runId = useId()
  const options = actuatorRunOptions(actuator)
  const [duration, setDuration] = useState(() =>
    pick === 'shortest' ? shortestRunSeconds(actuator) : pickDefaultDuration(actuator, options),
  )
  const { note, sending, execute, resetNote } = useDeviceCommand()
  const local = device.connection === 'local'
  const autoMode = deviceAutoMode(device)
  const durationsKey = actuator.durations?.join(',') ?? '-'

  useEffect(() => {
    resetNote()
    const next = actuatorRunOptions(actuator)
    setDuration(
      pick === 'shortest' ? shortestRunSeconds(actuator) : pickDefaultDuration(actuator, next),
    )
  }, [actuator.id, pick, resetNote])

  useEffect(() => {
    const next = actuatorRunOptions(actuator)
    if (pick === 'shortest') {
      const shortest = shortestRunSeconds(actuator)
      if (duration !== shortest) setDuration(shortest)
      return
    }
    if (!next.some((o) => o.seconds === duration)) {
      setDuration(pickDefaultDuration(actuator, next))
    }
  }, [actuator.max_run_s, durationsKey, duration, pick])

  const noDur = !options.some((option) => option.seconds === duration)
  const auto = local && autoMode
  const blocked = !canControl || !device.online || sending || noDur || auto
  const title = !canControl
    ? t('dashboard.permissionControl')
    : !device.online
      ? t('devices.offlineSentence')
      : sending
        ? t('devices.sending')
        : auto
          ? t('devices.autoRefusal')
          : noDur
            ? t('devices.noRunTime')
            : undefined

  function onWater() {
    if (blocked) return
    void execute({
      farmId,
      deviceId: device.id,
      actuatorId: actuator.id,
      action: 'on',
      duration_s: duration,
      local,
      onSettled,
    })
  }

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {pick === 'select' ? (
          <>
            <label className="sr-only" htmlFor={runId}>
              {t('devices.wateringDuration')}
            </label>
            <select
              id={runId}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={blocked}
              title={title}
              className="min-w-[7rem] max-w-full rounded-full border border-line bg-white px-3 py-1.5 text-xs text-ink disabled:opacity-60"
            >
              {options.map((o) => (
                <option key={o.seconds} value={o.seconds}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <span title={title} className="inline-flex min-w-0">
          <button
            type="button"
            onClick={onWater}
            disabled={blocked}
            title={title}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            <Play size={14} aria-hidden />
            {t('devices.waterNow')}
          </button>
        </span>
      </div>
      {note ? <CommandNote note={note} /> : null}
    </div>
  )
}
