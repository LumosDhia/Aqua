import type { ReactNode } from 'react'
import type { WaterKind } from '../../api'
import { WaterSourceIcon } from '../icons/WaterSourceIcons'
import { sourceLabel } from './format'

export function Chip({
  children,
  className = 'bg-cream text-ink',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      title={typeof children === 'string' ? children : undefined}
      className={`inline-block max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      {children}
    </span>
  )
}

export function SourceChip({
  kind,
  className = 'bg-leaf-soft/70 text-forest',
}: {
  kind: WaterKind
  className?: string
}) {
  const label = sourceLabel(kind)
  return (
    <span
      title={label}
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      <WaterSourceIcon kind={kind} size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  )
}
