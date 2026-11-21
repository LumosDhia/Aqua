import { t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { OctagonX, Plus } from 'lucide-react'
import {
  ApiError,
  api,
  canControlDevices,
  canManageDevices,
  type Actuator,
  type Device,
  type DeviceCreated,
} from '../api'
import { formatInt } from '../lib/status'
import { DeviceCard } from './devices/DeviceCard'
import { DeviceDialog, type DevicePlotOption } from './devices/DeviceDialog'
import { EmptyState } from './EmptyState'
import { PageFrame } from './PageFrame'

type DevicesPanelProps = {
  farmId: number | null
  role: string
  plots: DevicePlotOption[]
}

export function DevicesPanel({ farmId, role, plots }: DevicesPanelProps) {
  const canManage = canManageDevices(role)
  const canControl = canControlDevices(role)
  const [devices, setDevices] = useState<Device[]>([])
  const [loadErr, setLoadErr] = useState('')
  const [ready, setReady] = useState(false)
  const [tick, setTick] = useState(0)
  const [activityTick, setActivityTick] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [reveal, setReveal] = useState<{ token: string; name: string } | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [addedNote, setAddedNote] = useState('')
  const [stopErr, setStopErr] = useState('')
  const [stopping, setStopping] = useState(false)
  const [stoppingN, setStoppingN] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const seqRef = useRef(0)

  useEffect(() => {
    setAddOpen(false)
    setEditDevice(null)
    setReveal(null)
    setHighlightId(null)
    setDevices([])
    setLoadErr('')
    setReady(false)
    setStopErr('')
    setStopping(false)
    setStoppingN(null)
    setAddedNote('')
  }, [farmId])

  useEffect(() => {
    if (highlightId == null) return
    const timer = window.setTimeout(() => setHighlightId(null), 2500)
    return () => window.clearTimeout(timer)
  }, [highlightId])

  useEffect(() => {
    if (!addedNote) return
    const timer = window.setTimeout(() => setAddedNote(''), 8000)
    return () => window.clearTimeout(timer)
  }, [addedNote])

  useEffect(() => {
    let cancelled = false
    let loading = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      if (loading || (isPoll && document.hidden)) return
      if (farmId == null) {
        if (!cancelled && my === seqRef.current) {
          setDevices([])
          setReady(true)
        }
        return
      }
      loading = true
      try {
        const rows = await api.devices(farmId, true)
        if (cancelled || my !== seqRef.current) return
        setDevices(rows)
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        if (!isPoll) {
          setLoadErr(e instanceof ApiError ? e.message : t('devices.loadError'))
        }
      } finally {
        loading = false
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load(false)
    const poll = () => void load(true)
    const timer = window.setInterval(poll, 2_000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      cancelled = true
      seqRef.current += 1
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [farmId, tick])

  const anyOn = devices.some((d) => d.actuators.some((a) => a.state === 'on'))
  const canStop = anyOn || devices.some((d) => d.connection === 'local')

  useEffect(() => {
    if (!anyOn) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [anyOn])

  function onRetry() {
    setLoadErr('')
    setReady(false)
    setTick((n) => n + 1)
  }

  function upsert(device: Device) {
    setDevices((list) => {
      const i = list.findIndex((d) => d.id === device.id)
      if (i === -1) return [device, ...list]
      const next = list.slice()
      next[i] = device
      return next
    })
  }

  function patchActuator(deviceId: number, actuator: Actuator) {
    setDevices((list) =>
      list.map((d) => {
        if (d.id !== deviceId) return d
        return {
          ...d,
          actuators: d.actuators.map((a) => (a.id === actuator.id ? actuator : a)),
        }
      }),
    )
  }

  function onCreated(created: DeviceCreated) {
    const { token: _token, ...device } = created
    upsert(device)
    setHighlightId(device.id)
    setAddOpen(false)
    setEditDevice(null)
    if (created.connection === 'local') {
      setReveal(null)
      setAddedNote(t('devices.boardAdded'))
      return
    }
    setReveal({ token: created.token, name: device.name })
  }

  function onCommandSettled() {
    setTick((n) => n + 1)
    setActivityTick((n) => n + 1)
  }

  async function onStopAll() {
    if (farmId == null || !canStop || stopping) return
    setStopErr('')
    setStopping(true)
    try {
      const result = await api.stopAllDevices(farmId)
      setStoppingN(result.stopping)
      const rows = await api.devices(farmId)
      setDevices(rows)
    } catch (error) {
      setStopErr(error instanceof ApiError ? error.message : t('devices.stopOutputsError'))
    } finally {
      onCommandSettled()
      setStopping(false)
      setStoppingN(null)
    }
  }

  const showAdd = canManage && farmId != null
  const empty = ready && devices.length === 0
  const hideGrid = loadErr && devices.length === 0 && ready
  const stopTitle = !canStop && !stopping ? t('devices.noRunning') : undefined
  const stopLabel =
    stoppingN != null
      ? t('devices.stoppingOutputs', { total: formatInt(stoppingN), outputs: stoppingN === 1 ? 'output' : 'outputs' })
      : t('devices.stopAll')
  const dialogOpen = addOpen || editDevice != null || reveal != null

  return (
    <PageFrame
      farmId={farmId}
      label={t('shell.devices')}
      busy={!ready}
      header={
        <>
          <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
                {t('shell.devices')}
              </h2>
              <p className="text-xs text-ink-soft">{t('devices.subtitle')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canControl && farmId != null ? (
                <span title={stopTitle} className="inline-flex shrink-0">
                  <button
                    type="button"
                    onClick={() => void onStopAll()}
                    disabled={!canStop || stopping}
                    title={stopTitle}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hanko/30 bg-hanko/10 px-4 py-2 text-sm font-medium text-hanko disabled:opacity-60"
                  >
                    <OctagonX size={16} aria-hidden />
                    {stopLabel}
                  </button>
                </span>
              ) : null}
              {showAdd ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditDevice(null)
                    setReveal(null)
                    setAddOpen(true)
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
                >
                  <Plus size={16} aria-hidden />
                  {t('devices.add')}
                </button>
              ) : null}
            </div>
          </header>
          {loadErr || stopErr || addedNote ? (
            <div className="flex flex-col gap-2 border-b border-line px-4 py-3 sm:px-6">
              {loadErr ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
                >
                  <p>{loadErr}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              ) : null}
              {stopErr ? (
                <p className="text-sm text-hanko" role="alert">
                  {stopErr}
                </p>
              ) : null}
              {addedNote ? (
                <p
                  role="status"
                  className="rounded-card border border-leaf/40 bg-leaf-soft/50 px-4 py-3 text-sm text-ink"
                >
                  {addedNote}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      }
    >
      {hideGrid ? null : !ready ? (
        <DeviceGridSkeleton />
      ) : empty ? (
        <EmptyState
          text={t('devices.empty')}
          action={showAdd
            ? { label: t('devices.add'), onClick: () => setAddOpen(true) }
            : { label: t('devices.add'), disabledReason: farmId == null ? t('common.selectFarm') : t('devices.addForbidden') }}
        />
      ) : farmId != null ? (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              farmId={farmId}
              device={d}
              canManage={canManage}
              canControl={canControl}
              now={now}
              activityTick={activityTick}
              highlight={highlightId === d.id}
              onEdit={() => {
                setAddOpen(false)
                setReveal(null)
                setEditDevice(d)
              }}
              onReveal={(token, name) => setReveal({ token, name })}
              onRemoved={() => {
                setDevices((list) => list.filter((x) => x.id !== d.id))
                setTick((n) => n + 1)
              }}
              onPatched={(actuator) => patchActuator(d.id, actuator)}
              onDevice={upsert}
              onSettled={onCommandSettled}
            />
          ))}
        </ul>
      ) : null}

      {farmId != null ? (
        <DeviceDialog
          open={dialogOpen}
          farmId={farmId}
          device={editDevice}
          reveal={reveal}
          plots={plots}
          onClose={() => {
            setAddOpen(false)
            setEditDevice(null)
            setReveal(null)
          }}
          onSaved={(device) => {
            upsert(device)
            setEditDevice(null)
          }}
          onCreated={onCreated}
        />
      ) : null}
    </PageFrame>
  )
}

function DeviceGridSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="min-w-0 rounded-card border border-line bg-white p-3">
          <div className="space-y-2">
            <div className="aqua-skel h-5 w-2/3 rounded" />
            <div className="aqua-skel h-3 w-1/2 rounded" />
            <div className="aqua-skel h-3 w-3/4 rounded" />
            <div className="aqua-skel mt-3 h-8 w-full rounded" />
            <div className="aqua-skel h-8 w-full rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}
