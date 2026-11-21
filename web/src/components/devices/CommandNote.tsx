import { t } from '../../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, type DeviceCommand } from '../../api'
import { executeActuatorCommand } from './command'
import { commandDoneNote } from './format'

const NO_ANSWER = 'The device did not answer. It may have lost its connection.'

export function boardActionError(error: unknown): string {
  if (!(error instanceof ApiError)) return t('devices.requestFailed')
  if (error.status === 0 || error.status >= 500) return t('devices.requestFailedDetail', { detail: error.message })
  return error.message
}

export type CommandNoteState =
  | { kind: 'sending' }
  | { kind: 'ok'; text: string }
  | { kind: 'fail'; text: string }
  | { kind: 'wait'; text: string }
  | { kind: 'error'; text: string }

function noteFromCommand(cmd: DeviceCommand | null): CommandNoteState {
  if (cmd == null || cmd.status === 'expired' || cmd.status === 'cancelled') {
    return { kind: 'wait', text: NO_ANSWER }
  }
  if (cmd.status === 'failed') {
    return { kind: 'fail', text: cmd.result.trim() || t('devices.commandFailed') }
  }
  if (cmd.status === 'done') {
    return { kind: 'ok', text: cmd.result.trim() || commandDoneNote(cmd) }
  }
  return { kind: 'wait', text: t('devices.waitingConfirm') }
}

export function CommandNote({ note }: { note: CommandNoteState }) {
  if (note.kind === 'sending') {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-ink-soft" role="status">
        <span className="aqua-spin shrink-0" aria-hidden />
        {t('devices.commandSending')}
      </p>
    )
  }
  if (note.kind === 'ok') {
    return (
      <p className="mt-2 text-xs text-forest" role="status">
        {note.text}
      </p>
    )
  }
  if (note.kind === 'wait') {
    return (
      <p className="mt-2 text-xs text-ochre" role="status">
        {note.text}
      </p>
    )
  }
  return (
    <p className="mt-2 text-xs text-hanko" role="alert">
      {note.text}
    </p>
  )
}

export function useDeviceCommand(): {
  note: CommandNoteState | null
  sending: boolean
  execute: (opts: {
    farmId: number
    deviceId: number
    actuatorId: number
    action: 'on' | 'off'
    duration_s?: number
    local: boolean
    onSettled: () => void
  }) => Promise<void>
  resetNote: () => void
} {
  const seqRef = useRef(0)
  const [note, setNote] = useState<CommandNoteState | null>(null)

  useEffect(() => {
    return () => {
      seqRef.current += 1
    }
  }, [])

  const resetNote = useCallback(() => setNote(null), [])

  const execute = useCallback(
    async (opts: {
      farmId: number
      deviceId: number
      actuatorId: number
      action: 'on' | 'off'
      duration_s?: number
      local: boolean
      onSettled: () => void
    }) => {
      seqRef.current += 1
      const my = seqRef.current
      setNote({ kind: 'sending' })
      try {
        const cmd = await executeActuatorCommand({
          farmId: opts.farmId,
          deviceId: opts.deviceId,
          actuatorId: opts.actuatorId,
          action: opts.action,
          duration_s: opts.duration_s,
          local: opts.local,
          cancelled: () => my !== seqRef.current,
        })
        if (my !== seqRef.current) return
        setNote(noteFromCommand(cmd))
        opts.onSettled()
      } catch (error) {
        if (my !== seqRef.current) return
        setNote({
          kind: 'error',
          text: opts.local ? boardActionError(error) : error instanceof ApiError ? error.message : t('devices.commandError'),
        })
        opts.onSettled()
      }
    },
    [],
  )

  return { note, sending: note?.kind === 'sending', execute, resetNote }
}
