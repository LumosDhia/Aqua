import { t } from '../i18n'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function LiveNumber({ value, unit = '' }: { value: number | null; unit?: string }) {
  const [display, setDisplay] = useState(value)
  const [changed, setChanged] = useState(false)
  const current = useRef(value)

  useEffect(() => {
    const from = current.current
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (from == null || value == null || from === value || motion.matches) {
      current.current = value
      setDisplay(value)
      setChanged(false)
      return
    }

    let frame: number
    const start = performance.now()
    setChanged(true)

    function draw(now: number) {
      if (from == null || value == null) return
      const progress = motion.matches ? 1 : Math.min((now - start) / 380, 1)
      current.current = from + (value - from) * progress
      setDisplay(current.current)
      if (progress < 1) frame = requestAnimationFrame(draw)
      else setChanged(false)
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [value])

  if (value == null) return <span className="font-sans text-xs font-medium">{t('common.noReading')}</span>
  const exact = `${numberFormat.format(value)}${unit}`
  return (
    <span
      className={changed ? 'rounded bg-leaf-soft motion-safe:transition-colors' : 'rounded motion-safe:transition-colors'}
      aria-label={exact}
    >
      <span aria-hidden>{numberFormat.format(display ?? value)}{unit}</span>
    </span>
  )
}

type StatTileProps = {
  label: string
  value: number | null
  unit?: string
  icon: LucideIcon
  loading?: boolean
  children?: ReactNode
  onClick?: () => void
}

export function StatTile({ label, value, unit, icon: Icon, loading, children, onClick }: StatTileProps) {
  const previous = useRef(value)
  const [change, setChange] = useState(0)
  useEffect(() => {
    const before = previous.current
    setChange(before != null && value != null ? Math.sign(value - before) : 0)
    previous.current = value
  }, [value])
  const TrendIcon = change > 0 ? ArrowUpRight : ArrowDownRight

  const content = (
    <>
      <span className="flex items-start justify-between gap-1 text-xs font-medium leading-tight text-ink-soft [font-variant:all-small-caps]">
        {label}
        <Icon size={14} className="shrink-0 text-forest" aria-hidden />
      </span>
      <span className="block break-words font-serif text-xl leading-snug text-ink">
        {loading ? (
          <span className="aqua-skel my-1.5 block h-4 w-12 rounded" aria-label={t('dashboard.readingLoading')} role="status" />
        ) : <LiveNumber value={value} unit={unit} />}
        {change && value != null ? (
          <span className="ms-1 inline-flex align-middle text-forest">
            <TrendIcon size={12} aria-hidden />
            <span className="sr-only">{change > 0 ? t('dashboard.readingUp') : t('dashboard.readingDown')}</span>
          </span>
        ) : null}
      </span>
      {children ? <span className="block text-[11px] leading-snug text-ink-soft">{children}</span> : null}
    </>
  )
  const card = 'min-w-0 rounded-card border border-line bg-cream p-2.5'
  return onClick ? (
    <button type="button" data-card="" onClick={onClick} className={`${card} text-start hover:border-forest`}>
      {content}
    </button>
  ) : (
    <article data-card="" className={card}>{content}</article>
  )
}
