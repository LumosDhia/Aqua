import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useRef, useState } from 'react'
import { EllipsisVertical, Monitor, Sprout, Wifi } from 'lucide-react'
import {
  ApiError,
  api,
  type Actuator,
  type Device,
  type DeviceCommand,
  type DeviceWithToken,
} from '../../api'
import { ActuatorRow } from './ActuatorRow'
import { PresenceChip } from './BoardControls'
import { LocalBoard } from './LocalBoard'
import {
  COMMAND_STATUS_CHIP,
  commandLine,
  deviceAutoMode,
  lastSeenLine,
  signalWord,
} from './format'

export function DeviceCard({
  farmId,
  device,
  canManage,
  canControl,
  now,
  activityTick,
  highlight,
  onEdit,
  onReveal,
  onRemoved,
  onPatched,
  onDevice,
  onSettled,
}: {
  farmId: number
  device: Device
  canManage: boolean
  canControl: boolean
  now: number
  activityTick: number
  highlight: boolean
  onEdit: () => void
  onReveal: (token: string, name: string) => void
  onRemoved: () => void
  onPatched: (next: Actuator) => void
  onDevice: (next: Device) => void
  onSettled: () => void
}) {
  const menuId = useId()
  const activityId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'rotate' | null>(null)
  const [actionErr, setActionErr] = useState('')
  const [activityOpen, setActivityOpen] = useState(false)
  const [commands, setCommands] = useState<DeviceCommand[] | null>(null)
  const [activityErr, setActivityErr] = useState('')
  const [activityReady, setActivityReady] = useState(false)

  useEffect(() => {
    setMenuOpen(false)
    setConfirm(null)
    setActionErr('')
  }, [device.id])

  useEffect(() => {
    if (!menuOpen) return
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!activityOpen) return
    let cancelled = false
    setActivityReady(false)
    api
      .deviceCommands(farmId, device.id)
      .then((rows) => {
        if (cancelled) return
        setCommands(rows.slice(0, 8))
        setActivityErr('')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setActivityErr(
          error instanceof ApiError ? error.message : t('devices.activityError'),
        )
      })
      .finally(() => {
        if (!cancelled) setActivityReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [activityOpen, activityTick, farmId, device.id])

  async function onRemove() {
    setActionErr('')
    try {
      await api.deleteDevice(farmId, device.id)
      onRemoved()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onRemoved()
        return
      }
      setActionErr(error instanceof ApiError ? error.message : t('devices.removeError'))
    }
  }

  async function onRotate() {
    setActionErr('')
    try {
      const next: DeviceWithToken = await api.rotateDeviceToken(farmId, device.id)
      const { token, ...rest } = next
      onDevice(rest)
      setConfirm(null)
      onReveal(token, rest.name)
    } catch (error) {
      setActionErr(error instanceof ApiError ? error.message : t('devices.rotateError'))
    }
  }

  const plotLabel = device.plot_name?.trim() || t('devices.notLinkedPlot')
  const firmware = device.firmware.trim()
  const ip = device.ip.trim()
  const seen = lastSeenLine(device.last_seen)
  const local = device.connection === 'local'
  const autoMode = deviceAutoMode(device)
  const address = device.base_url?.trim() ?? ''
  const [showPage, setShowPage] = useState(false)

  return (
    <li
      data-card=""
      className={`flex min-w-0 flex-col rounded-card border border-line p-3 ${
        highlight ? 'bg-leaf-soft/40 ring-2 ring-leaf' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-lg leading-tight text-ink">{device.name}</p>
          <EnteredBy record={device} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PresenceChip online={device.online} />
            <span className="text-[11px] text-ink-soft">{seen}</span>
          </div>
        </div>
        {canManage && !confirm ? (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              type="button"
              aria-label={t('devices.actions', { name: device.name })}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-forest"
            >
              <EllipsisVertical size={16} aria-hidden />
            </button>
            {menuOpen ? (
              <div
                id={menuId}
                role="menu"
                className="absolute end-0 z-20 mt-1 w-44 rounded-card border border-line bg-white p-1 shadow-shell"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit()
                  }}
                  className="flex w-full rounded-xl px-3 py-1.5 text-start text-sm text-ink hover:bg-cream"
                >
                  {t('common.edit')}
                </button>
                {local ? null : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false)
                      setConfirm('rotate')
                      setActionErr('')
                    }}
                    className="flex w-full rounded-xl px-3 py-1.5 text-start text-sm text-ink hover:bg-cream"
                  >
                    {t('devices.rotate')}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setConfirm('delete')
                    setActionErr('')
                  }}
                  className="flex w-full rounded-xl px-3 py-1.5 text-start text-sm text-hanko hover:bg-cream"
                >
                  {t('common.delete')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Sprout size={12} aria-hidden />
          <span className="truncate">{plotLabel}</span>
        </span>
        {local ? (
          address ? <span className="truncate font-mono text-[11px]">{address}</span> : null
        ) : (
          <>
            {firmware ? <span className="truncate">{firmware}</span> : null}
            <span className="inline-flex items-center gap-1">
              <Wifi size={12} aria-hidden />
              {signalWord(device.rssi)}
            </span>
            {ip ? <span className="truncate text-mute">{ip}</span> : null}
          </>
        )}
      </p>

      {local ? (
        <LocalBoard
          farmId={farmId}
          device={device}
          canControl={canManage}
          onDevice={onDevice}
          onSettled={onSettled}
        />
      ) : null}

      {local && address ? (
        <div className="mt-3 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={showPage}
              onClick={() => setShowPage((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-cream px-3 py-1.5 text-xs font-medium text-forest"
            >
              <Monitor size={14} aria-hidden />
              {showPage ? t('devices.hideInterface') : t('devices.openInterface')}
            </button>
          </div>
          {showPage ? (
            <div className="mt-2 overflow-hidden rounded-card border border-line bg-white">
              <iframe
                title={t('devices.interfaceTitle', { name: device.name })}
                src={address}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="h-[70dvh] min-h-80 w-full"
                dir="ltr"
              />
              <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-soft">{t('devices.interfaceHelp')}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {actionErr ? (
        <p className="mt-2 text-sm text-hanko" role="alert">
          {actionErr}
        </p>
      ) : null}

      {canManage && confirm === 'delete' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <p className="text-ink">{t('common.remove')}{' '} {device.name}?</p>
          <button
            type="button"
            onClick={() => void onRemove()}
            className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
          >
            {t('common.yes')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(null)
              setActionErr('')
            }}
            className="rounded-full border border-line px-3 py-1 text-xs"
          >
            {t('common.no')}
          </button>
        </div>
      ) : null}

      {canManage && confirm === 'rotate' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <p className="text-ink">{t('devices.rotateConfirm')}</p>
          <button
            type="button"
            onClick={() => void onRotate()}
            className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
          >
            {t('common.yes')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirm(null)
              setActionErr('')
            }}
            className="rounded-full border border-line px-3 py-1 text-xs"
          >
            {t('common.no')}
          </button>
        </div>
      ) : null}

      {device.actuators.length > 0 ? (
        <ul className="mt-3 min-w-0">
          {device.actuators.map((a) => (
            <ActuatorRow
              key={a.id}
              farmId={farmId}
              deviceId={device.id}
              actuator={a}
              online={device.online}
              canControl={canControl}
              canManage={canManage}
              local={local}
              autoMode={autoMode}
              now={now}
              onPatched={onPatched}
              onSettled={onSettled}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-ink-soft">{t('dashboard.noOutputs')}</p>
      )}

      <div className="mt-3 border-t border-line pt-2">
        <button
          type="button"
          aria-expanded={activityOpen}
          aria-controls={activityId}
          onClick={() => setActivityOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-xl py-1 text-start text-sm font-medium text-ink hover:text-forest"
        >
          {t('devices.recent')}
          <span aria-hidden className="text-ink-soft">
            {activityOpen ? t('common.hide') : t('common.show')}
          </span>
        </button>
        {activityOpen ? (
          <div id={activityId} className="mt-2">
            {!activityReady ? (
              <div className="space-y-2" aria-hidden>
                <div className="aqua-skel h-3 w-3/4 rounded" />
                <div className="aqua-skel h-3 w-1/2 rounded" />
              </div>
            ) : activityErr ? (
              <p className="text-sm text-hanko" role="alert">
                {activityErr}
              </p>
            ) : !commands || commands.length === 0 ? (
              <p className="text-xs text-ink-soft">{t('devices.noCommands')}</p>
            ) : (
              <ul className="space-y-2">
                {commands.map((cmd) => {
                  const chip = COMMAND_STATUS_CHIP[cmd.status]
                  return (
                    <li key={cmd.id} className="min-w-0 text-xs">
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 flex-1 break-words text-ink">{commandLine(cmd)}</p>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.className}`}
                        >
                          {chip.label}
                        </span>
                      </div>
                      <EnteredBy record={cmd} />
                      {cmd.result.trim() ? (
                        <p className="mt-0.5 break-words text-ink-soft">{cmd.result}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </li>
  )
}
