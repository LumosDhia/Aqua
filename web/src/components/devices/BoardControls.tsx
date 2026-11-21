import { t } from '../../i18n'
import { useId, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { api, type Device } from '../../api'
import { boardActionError, CommandNote, type CommandNoteState } from './CommandNote'

export function PresenceChip({ online }: { online: boolean }) {
  if (online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest">
        <span className="relative flex h-1.5 w-1.5" aria-hidden>
          <span className="aqua-pulse absolute inset-0 rounded-full bg-leaf" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-leaf" />
        </span>
        {t('devices.online')}
      </span>
    )
  }
  return (
    <span className="inline-flex rounded-full bg-cream px-2 py-0.5 text-[11px] font-medium text-ink-soft">
      {t('devices.offline')}
    </span>
  )
}

export function BoardStatus({ status, alarm }: { status: string; alarm: boolean }) {
  const text = status.trim()
  if (!text && !alarm) return null
  return (
    <p
      role={alarm ? 'alert' : 'status'}
      className={`flex min-w-0 items-start gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs ${
        alarm
          ? 'border-hanko/30 bg-hanko/10 text-hanko'
          : 'border-leaf/40 bg-leaf-soft/60 text-forest'
      }`}
    >
      {alarm ? <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> : null}
      <span className="min-w-0 break-words">
        {text || t('devices.alarmLabel')}
      </span>
    </p>
  )
}

export function BoardModeSwitch({
  farmId,
  device,
  canControl,
  onDevice,
  onSettled,
  compact = false,
}: {
  farmId: number
  device: Device
  canControl: boolean
  onDevice: (next: Device) => void
  onSettled?: () => void
  compact?: boolean
}) {
  const groupId = useId()
  const [note, setNote] = useState<CommandNoteState | null>(null)
  const auto = device.mode_auto ?? device.data?.auto ?? null
  const help = auto === null ? t('devices.waiting') : auto
    ? t('devices.autoHelp')
    : t('devices.manualHelp')
  const busy = note?.kind === 'sending'
  const modeTitle = !canControl ? t('devices.modePermission') : compact ? help : undefined
  const modeBlocked = !canControl || busy

  async function setMode(next: boolean) {
    if (modeBlocked) return
    setNote({ kind: 'sending' })
    try {
      const { message, ...saved } = await api.setDeviceMode(farmId, device.id, next)
      setNote({ kind: 'ok', text: message })
      onDevice(saved)
    } catch (error) {
      setNote({ kind: 'error', text: boardActionError(error) })
    } finally {
      onSettled?.()
    }
  }

  return (
    <div className="min-w-0">
      <span title={modeTitle} className="inline-flex max-w-full">
        <div
          role="radiogroup"
          aria-label={t('devices.boardMode')}
          aria-describedby={groupId}
          onKeyDown={(e) => {
            if (modeBlocked) return
            if (e.key === 'ArrowLeft' || e.key === 'Home') {
              e.preventDefault()
              void setMode(true)
            } else if (e.key === 'ArrowRight' || e.key === 'End') {
              e.preventDefault()
              void setMode(false)
            }
          }}
          className="inline-flex max-w-full items-center rounded-full border border-line bg-cream p-0.5 text-xs"
        >
          {(
            [
              [true, t('devices.auto')],
              [false, t('devices.manual')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={auto === value}
              disabled={modeBlocked}
              title={modeTitle}
              onClick={() => void setMode(value)}
              className={`rounded-full px-3 py-1 font-medium disabled:opacity-60 ${
                auto === value ? 'bg-forest-deep text-white' : 'text-ink-soft hover:text-forest'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </span>
      <p id={groupId} className={compact ? 'sr-only' : 'mt-1 text-[11px] text-ink-soft'}>
        {help}
      </p>
      {note ? <CommandNote note={note} /> : null}
    </div>
  )
}
