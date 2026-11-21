import { t, countLabel } from '../../i18n'
import {
  Fan,
  Lightbulb,
  ToggleRight,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type {
  Actuator,
  ActuatorKind,
  Device,
  DeviceCommand,
  DeviceCommandStatus,
} from '../../api'
import { formatInt, formatRelative } from '../../lib/status'

export type RunOption = { seconds: number; label: string }

export const RUN_OPTIONS: RunOption[] = [
  { seconds: 300, get label() { return t('common.minutesFive') } },
  { seconds: 600, get label() { return t('common.minutesTen') } },
  { seconds: 900, get label() { return t('common.minutesFifteen') } },
  { seconds: 1800, get label() { return t('common.minutesThirty') } },
  { seconds: 3600, get label() { return t('common.hourOne') } },
]

const KIND_META: Record<ActuatorKind, { label: string; Icon: LucideIcon }> = {
  pump: { get label() { return t('devices.pump') }, Icon: Waves },
  valve: { get label() { return t('devices.valve') }, Icon: ToggleRight },
  light: { get label() { return t('devices.light') }, Icon: Lightbulb },
  fan: { get label() { return t('devices.fan') }, Icon: Fan },
  relay: { get label() { return t('devices.relay') }, Icon: Zap },
}

const KIND_FALLBACK: { label: string; Icon: LucideIcon } = {
  get label() { return t('devices.relay') },
  Icon: Zap,
}

export function actuatorMeta(kind: ActuatorKind): { label: string; Icon: LucideIcon } {
  return KIND_META[kind] ?? KIND_FALLBACK
}

export function signalWord(rssi: number | null): string {
  if (rssi == null) return t('devices.noSignal')
  if (rssi > -60) return t('onboarding.strongPassword')
  if (rssi > -75) return t('onboarding.fairPassword')
  return t('devices.weakSignal')
}

export function lastSeenLine(iso: string | null): string {
  if (!iso) return t('devices.never')
  const rel = formatRelative(iso)
  if (rel === t('common.noReading')) return t('devices.never')
  return t('devices.lastSeen', { time: rel })
}

export function allowedRunOptions(maxRunS: number): RunOption[] {
  return RUN_OPTIONS.filter((o) => o.seconds <= maxRunS)
}

export function defaultDuration(options: RunOption[]): number {
  const ten = options.find((o) => o.seconds === 600)
  if (ten) return ten.seconds
  return options[options.length - 1]?.seconds ?? 0
}

export function deviceAutoMode(device: Device): boolean {
  if (device.connection !== 'local') return true
  return device.mode_auto ?? device.data?.auto ?? false
}

export function devicesWithOutputs(devices: Device[]): Device[] {
  return devices.filter((d) => d.actuators.length > 0)
}

export function plotPump(
  devices: Device[],
  plotId: number,
): { device: Device; actuator: Actuator } | null {
  const device = devices.find(
    (d) => d.plot_id === plotId && d.actuators.some((a) => a.kind === 'pump'),
  )
  if (!device) return null
  const actuator = device.actuators.find((a) => a.kind === 'pump')
  if (!actuator) return null
  return { device, actuator }
}

export function shortestRunSeconds(actuator: Actuator): number {
  const options = actuatorRunOptions(actuator)
  return options[0]?.seconds ?? 0
}

export function actuatorRunOptions(actuator: Actuator): RunOption[] {
  if (actuator.durations != null) {
    return actuator.durations.map((seconds) => ({
      seconds,
      label: seconds === 0 ? t('devices.untilStop') : durationShort(seconds),
    }))
  }
  return allowedRunOptions(actuator.max_run_s)
}

export function pickDefaultDuration(actuator: Actuator, options: RunOption[]): number {
  if (actuator.durations != null && options.length >= 2) return options[1].seconds
  if (actuator.durations != null && options.length === 1) return options[0].seconds
  return defaultDuration(options)
}

export function remainingSeconds(onUntil: string | null, now: number): number | null {
  if (!onUntil) return null
  const end = Date.parse(onUntil)
  if (Number.isNaN(end)) return null
  return Math.max(0, Math.round((end - now) / 1000))
}

const paddedSeconds = new Intl.NumberFormat('en', { minimumIntegerDigits: 2, useGrouping: false })

export function formatCountdown(onUntil: string, now: number): string {
  const sec = remainingSeconds(onUntil, now)
  if (sec == null) return ''
  if (sec < 60) return t('devices.secondsLeft', { seconds: formatInt(sec) })
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return t('devices.clockLeft', { minutes: formatInt(m), seconds: paddedSeconds.format(s) })
}

export function sinceWaterLine(since: number): string {
  if (since < 0) return t('devices.sinceBoot')
  if (since < 60) return t('devices.lastWateredSeconds', { seconds: formatInt(since) })
  if (since < 3600) return t('devices.lastWateredMinutes', { minutes: formatInt(Math.floor(since / 60)) })
  return t('devices.lastWateredHours', { hours: formatInt(Math.floor(since / 3600)) })
}

export function staleValuesNote(lastSeen: string | null): string {
  if (!lastSeen) return t('common.noReading')
  const rel = formatRelative(lastSeen)
  if (rel === t('common.noReading')) return t('common.noReading')
  return t('devices.lastSeenStale', { time: rel })
}

export function durationShort(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const h = seconds / 3600
    return countLabel('devices.durationHours', h)
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    const m = seconds / 60
    return m === 1 ? t('devices.oneMinuteShort') : t('devices.durationMin', { minutes: formatInt(m) })
  }
  return t('devices.durationSec', { seconds: formatInt(seconds) })
}

export function durationLong(seconds: number): string {
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const h = seconds / 3600
    return countLabel('devices.durationHours', h)
  }
  const m = Math.round(seconds / 60)
  if (m <= 0) return countLabel('devices.durationSeconds', seconds)
  return countLabel('devices.durationMinutes', m)
}

export function commandLine(cmd: DeviceCommand): string {
  if (cmd.action === 'auto') return t('devices.setAuto')
  if (cmd.action === 'manual') return t('devices.setManual')
  if (cmd.action === 'off') return t('devices.stopped', { actuator: cmd.actuator })
  if (cmd.duration_s === 0) return t('devices.startedUntilStop', { actuator: cmd.actuator })
  if (cmd.duration_s != null && cmd.duration_s > 0) {
    return t('devices.startedFor', { actuator: cmd.actuator, duration: durationShort(cmd.duration_s) })
  }
  return t('devices.started', { actuator: cmd.actuator })
}

export function commandDoneNote(cmd: DeviceCommand): string {
  if (cmd.action === 'off') return t('devices.commandDoneStop', { actuator: cmd.actuator })
  if (cmd.duration_s === 0) return t('devices.commandDoneIndefinite', { actuator: cmd.actuator })
  if (cmd.duration_s != null && cmd.duration_s > 0) {
    return t('devices.commandDoneTimed', { actuator: cmd.actuator, duration: durationLong(cmd.duration_s) })
  }
  return t('devices.commandDoneStart', { actuator: cmd.actuator })
}

export const COMMAND_STATUS_CHIP: Record<
  DeviceCommandStatus,
  { label: string; className: string }
> = {
  pending: { get label() { return t('common.waiting') }, className: 'bg-ochre-soft/60 text-ink' },
  delivered: { get label() { return t('common.waiting') }, className: 'bg-ochre-soft/60 text-ink' },
  done: { get label() { return t('common.done') }, className: 'bg-leaf-soft/70 text-forest' },
  failed: { get label() { return t('common.failed') }, className: 'bg-hanko/10 text-hanko' },
  expired: { get label() { return t('common.expired') }, className: 'bg-ochre/20 text-ink' },
  cancelled: { get label() { return t('common.cancelled') }, className: 'bg-cream-deep text-ink-soft' },
}
