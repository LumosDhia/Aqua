import { api, type DeviceCommand } from '../../api'

export async function executeActuatorCommand(opts: {
  farmId: number
  deviceId: number
  actuatorId: number
  action: 'on' | 'off'
  duration_s?: number
  local: boolean
  cancelled: () => boolean
}): Promise<DeviceCommand | null> {
  const body =
    opts.action === 'on'
      ? { action: 'on' as const, duration_s: opts.duration_s }
      : { action: 'off' as const }
  const cmd = await api.commandActuator(opts.farmId, opts.deviceId, opts.actuatorId, body)
  if (opts.cancelled()) return null
  // Local boards finish in this response; push boards need polling.
  if (opts.local) return cmd
  return waitForCommand(opts.farmId, opts.deviceId, cmd, opts.cancelled)
}

async function waitForCommand(
  farmId: number,
  deviceId: number,
  initial: DeviceCommand,
  cancelled: () => boolean,
): Promise<DeviceCommand | null> {
  if (isSettled(initial.status)) return initial
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    await sleep(1000)
    if (cancelled()) return null
    try {
      const list = await api.deviceCommands(farmId, deviceId)
      if (cancelled()) return null
      const found = list.find((c) => c.id === initial.id)
      if (found && isSettled(found.status)) return found
    } catch {
      /* keep polling until the deadline */
    }
  }
  return null
}

function isSettled(status: DeviceCommand['status']): boolean {
  return (
    status === 'done' ||
    status === 'failed' ||
    status === 'expired' ||
    status === 'cancelled'
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
