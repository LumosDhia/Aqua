import { t } from '../../i18n'
import { EnteredBy } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import {
  ApiError,
  api,
  type Device,
  type DeviceConnection,
  type DeviceCreated,
  type DeviceWrite,
} from '../../api'
import { formatInt } from '../../lib/status'
import { ConnectPanel } from './ConnectPanel'

const NAME_MAX = 80

export type DevicePlotOption = { id: number; name: string }

type DeviceDialogProps = {
  open: boolean
  farmId: number
  device: Device | null
  reveal: { token: string; name: string } | null
  plots: DevicePlotOption[]
  onClose: () => void
  onSaved: (device: Device) => void
  onCreated: (device: DeviceCreated) => void
}

export function DeviceDialog({
  open,
  farmId,
  device,
  reveal,
  plots,
  onClose,
  onSaved,
  onCreated,
}: DeviceDialogProps) {
  const titleId = useId()
  const nameId = useId()
  const plotId = useId()
  const plotHelpId = useId()
  const addrId = useId()
  const addrHelpId = useId()
  const addrErrId = useId()
  const connHelpId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const editing = device != null
  const showConnect = reveal != null
  const [name, setName] = useState('')
  const [plot, setPlot] = useState('')
  const [connection, setConnection] = useState<DeviceConnection>('local')
  const [addr, setAddr] = useState('')
  const [pinned, setPinned] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [addrErr, setAddrErr] = useState('')
  const isLocal = device != null ? device.connection === 'local' : connection === 'local'

  const plotChoices = missingPlotOption(device, plots)

  useEffect(() => {
    if (!open) return
    let live = true
    api
      .boardAddress(farmId)
      .then((r) => {
        if (!live) return
        setPinned(r.url)
        if (r.url && !device) setAddr(r.url)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [open, farmId, device])

  useEffect(() => {
    if (!open || reveal) return
    setErr('')
    setAddrErr('')
    setBusy(false)
    if (device) {
      setName(device.name)
      setPlot(device.plot_id == null ? '' : String(device.plot_id))
      setConnection(device.connection)
      setAddr(device.base_url ?? '')
    } else {
      setName('')
      setPlot('')
      setConnection('local')
      setAddr(pinned ?? '')
    }
  }, [open, device, reveal, pinned])

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
  }, [open, reveal])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setErr(t('common.nameRequired'))
      return
    }
    if (trimmed.length > NAME_MAX) {
      setErr(t('devices.nameLimit'))
      return
    }
    const plotRaw = plot === '' ? null : Number(plot)
    if (plotRaw != null && !Number.isFinite(plotRaw)) {
      setErr(t('devices.choosePlot'))
      return
    }
    if (isLocal) {
      const url = addr.trim()
      if (!url) {
        setAddrErr(t('devices.localAddressRequired'))
        setErr('')
        return
      }
    }
    setBusy(true)
    setErr('')
    setAddrErr('')
    const body: DeviceWrite = {
      name: trimmed,
      plot_id: plotRaw,
      ...(editing
        ? isLocal
          ? { base_url: addr.trim() }
          : {}
        : {
            connection,
            ...(isLocal ? { base_url: addr.trim() } : {}),
          }),
    }
    try {
      if (device) {
        const saved = await api.updateDevice(farmId, device.id, body)
        onSaved(saved)
        onClose()
      } else {
        const created = await api.createDevice(farmId, body)
        onCreated(created)
      }
    } catch (error) {
      const msg =
        error instanceof ApiError
          ? error.message
          : editing
            ? t('devices.saveError')
            : t('devices.addError')
      if (isLocal && isAddressProblem(error)) setAddrErr(msg)
      else setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

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
        className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        {showConnect && reveal ? (
          <ConnectPanel token={reveal.token} titleId={titleId} onDone={onClose} />
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="font-serif text-2xl text-ink">
                {editing ? t('devices.edit') : t('devices.add')}
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
            <form className="mt-4 space-y-3" onSubmit={submit}>
              {device ? <EnteredBy record={device} /> : null}
              {editing ? null : (
                <div>
                  <p id={connHelpId} className="text-xs font-medium text-ink-soft">
                    {t('devices.connection')}
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby={connHelpId}
                    onKeyDown={(e) => {
                      if (busy) return
                      if (e.key === 'ArrowLeft' || e.key === 'Home' || e.key === 'ArrowUp') {
                        e.preventDefault()
                        setConnection('local')
                      } else if (
                        e.key === 'ArrowRight' ||
                        e.key === 'End' ||
                        e.key === 'ArrowDown'
                      ) {
                        e.preventDefault()
                        setConnection('push')
                      }
                    }}
                    className="mt-1 grid grid-cols-1 gap-2"
                  >
                    {(
                      [
                        ['local', t('devices.localBoard')],
                        ['push', t('devices.remoteBoard')],
                      ] as const
                    ).map(([id, label]) => {
                      const on = connection === id
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={busy}
                          onClick={() => {
                            setConnection(id)
                            setAddrErr('')
                            setErr('')
                          }}
                          className={`rounded-card border px-3 py-2 text-start text-sm leading-snug disabled:opacity-60 ${
                            on
                              ? 'border-forest bg-leaf-soft/40 text-ink'
                              : 'border-line bg-white text-ink-soft hover:text-forest'
                          }`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <div>
                <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">
                  {t('common.name')}
                </label>
                <input
                  id={nameId}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={NAME_MAX}
                  required
                  placeholder={isLocal ? t('devices.farmBoard') : t('devices.pumpBox')}
                  disabled={busy}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
                />
              </div>
              {isLocal ? (
                <div>
                  <label htmlFor={addrId} className="text-xs font-medium text-ink-soft">
                    {t('devices.localAddress')}
                  </label>
                  <input
                    id={addrId}
                    value={pinned ?? addr}
                    readOnly={pinned != null}
                    onChange={(e) => {
                      setAddr(e.target.value)
                      if (addrErr) setAddrErr('')
                    }}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={addrErr ? true : undefined}
                    aria-describedby={addrErr ? `${addrHelpId} ${addrErrId}` : addrHelpId}
                    className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
                  />
                  <p id={addrHelpId} className="mt-1 text-xs text-ink-soft">
                    {pinned
                      ? t('devices.localAddressCurrent', { address: pinned })
                      : t('devices.localAddressHelp')}
                  </p>
                  {addrErr ? (
                    <p id={addrErrId} className="mt-1 text-sm text-hanko" role="alert">
                      {addrErr}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <label htmlFor={plotId} className="text-xs font-medium text-ink-soft">
                  {t('devices.linkedPlot')}
                </label>
                <select
                  id={plotId}
                  value={plot}
                  onChange={(e) => setPlot(e.target.value)}
                  disabled={busy}
                  aria-describedby={plotHelpId}
                  className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
                >
                  <option value="">{t('devices.notLinked')}</option>
                  {plotChoices.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p id={plotHelpId} className="mt-1 text-xs text-ink-soft">
                  {isLocal
                    ? t('devices.plotHint')
                    : t('devices.plotHintExtended')}
                </p>
              </div>
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
                  {busy ? t('common.saving') : editing ? t('common.save') : t('devices.add')}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function isAddressProblem(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  const lower = error.message.toLowerCase()
  return error.status === 422 && /address|http|url|192\.168|base_url|base url/.test(lower)
}

function missingPlotOption(
  device: Device | null,
  plots: DevicePlotOption[],
): DevicePlotOption[] {
  if (device?.plot_id == null) return plots
  if (plots.some((p) => p.id === device.plot_id)) return plots
  return [
    { id: device.plot_id, name: device.plot_name ?? t('devices.plotFallback', { id: formatInt(device.plot_id) }) },
    ...plots,
  ]
}
