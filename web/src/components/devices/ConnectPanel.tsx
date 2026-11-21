import { t } from '../../i18n'
import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

export function ConnectPanel({
  token,
  titleId,
  onDone,
}: {
  token: string
  titleId: string
  onDone: () => void
}) {
  const server = window.location.origin

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-serif text-2xl text-ink">
          {t('devices.connect')}
        </h2>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
          aria-label={t('common.close')}
        >
          <X size={18} />
        </button>
      </div>
      <CopyField label={t('devices.secret')} value={token} />
      <CopyField label={t('devices.server')} value={server} />
      <ol className="list-decimal space-y-1 ps-5 text-sm text-ink">
        <li>
          {t('devices.openFirmware')}{' '}
          <code className="rounded bg-cream px-1 font-mono text-xs">firmware/aqua_device/config.h</code>
        </li>
        <li>
          {t('devices.configure')}{' '} <code className="rounded bg-cream px-1 font-mono text-xs">AQUA_SERVER</code> and{' '}
          <code className="rounded bg-cream px-1 font-mono text-xs">DEVICE_TOKEN</code>
        </li>
        <li>{t('devices.setWifi')}</li>
        <li>{t('devices.powerBoard')}</li>
      </ol>
      <p
        role="status"
        className="rounded-card border border-ochre/30 bg-ochre/10 px-3 py-2 text-sm text-ink"
      >
        {t('devices.keepSecret')}
      </p>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onDone}
          className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
        >
          {t('devices.savedKey')}
        </button>
      </div>
    </div>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  async function onCopy() {
    let ok = false
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(value)
        ok = true
      } catch {
        ok = false
      }
    }
    if (!ok) {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
      }
      return
    }
    setCopied(true)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="text-xs font-medium text-ink-soft">
        {label}
      </label>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <input
          id={inputId}
          ref={inputRef}
          readOnly
          value={value}
          className="min-w-0 flex-1 rounded-xl border border-line bg-cream px-3 py-2 font-mono text-xs text-ink"
        />
        <button
          type="button"
          onClick={() => void onCopy()}
          className="shrink-0 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
        >
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
    </div>
  )
}
