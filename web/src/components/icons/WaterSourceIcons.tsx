import type { ComponentType, ReactNode, SVGProps } from 'react'
import type { WaterKind } from '../../api'

export type WaterSourceIconProps = {
  size?: number
  className?: string
  title?: string
} & Omit<SVGProps<SVGSVGElement>, 'children' | 'viewBox'>

function IconSvg({
  size = 24,
  className,
  title,
  children,
  ...rest
}: WaterSourceIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      strokeWidth={1.75}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export function WellIcon(props: WaterSourceIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M7.5 8 12 3.6l4.5 4.4" />
      <path d="M8.4 8v6.4M15.6 8v6.4" />
      <path d="M12 8v4.1" />
      <path d="M10.35 12.1h3.3v1.75c0 .7-.75 1.25-1.65 1.25s-1.65-.55-1.65-1.25z" />
      <ellipse cx="12" cy="14.4" rx="6.5" ry="1.9" fill="currentColor" fillOpacity="0.12" />
      <path d="M5.5 14.4v5.2c0 1.15 2.9 2.05 6.5 2.05s6.5-.9 6.5-2.05v-5.2" />
      <path d="M8.3 16.5v2.2M12 16.8v2.5M15.7 16.5v2.2" />
    </IconSvg>
  )
}

export function BoreholeIcon(props: WaterSourceIconProps) {
  return (
    <IconSvg {...props}>
      <rect x="8.3" y="3.3" width="7.4" height="5.5" rx="1.1" />
      <circle cx="12" cy="6" r="1.2" />
      <path d="M15.7 6.2h3.2V10.4" />
      <path d="M2.6 12.4h18.8" />
      <path d="M4.3 12.4 5.5 14.8M7.5 12.4 8.7 14.8M15.3 12.4 16.5 14.8M18.5 12.4 19.7 14.8" />
      <path d="M11.15 10.4v8.6M12.85 10.4v8.6" />
      <path d="M12 18.6s-1.3 1.6-1.3 2.35a1.3 1.3 0 0 0 2.6 0c0-.75-1.3-2.35-1.3-2.35z" />
    </IconSvg>
  )
}

export function TankIcon(props: WaterSourceIconProps) {
  return (
    <IconSvg {...props}>
      <ellipse cx="12" cy="5.8" rx="6.6" ry="2.15" />
      <path d="M5.4 5.8v10.4c0 1.2 3 2.15 6.6 2.15s6.6-.95 6.6-2.15V5.8" />
      <ellipse cx="12" cy="11.4" rx="6.6" ry="2.15" fill="currentColor" fillOpacity="0.12" />
      <path d="M7.2 18.4v2.8M16.8 18.4v2.8M6.2 21.2h2M15.8 21.2h2" />
      <circle cx="19.1" cy="13.4" r="1.25" />
      <path d="M20.35 13.4h2.15" />
    </IconSvg>
  )
}

export function RainTankIcon(props: WaterSourceIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2.6 6.2h7.6L8 9" />
      <path d="M9.2 6.2v5" />
      <ellipse cx="12.4" cy="11.4" rx="5.8" ry="1.9" />
      <path d="M6.6 11.4v8.1c0 1.05 2.6 1.9 5.8 1.9s5.8-.85 5.8-1.9v-8.1" />
      <ellipse cx="12.4" cy="15.6" rx="5.8" ry="1.9" />
      <path d="M16.2 2.5s-1.35 2.1-1.35 3.05a1.35 1.35 0 0 0 2.7 0c0-.95-1.35-3.05-1.35-3.05z" />
      <path d="M20.1 4s-1.2 1.85-1.2 2.7a1.2 1.2 0 0 0 2.4 0c0-.85-1.2-2.7-1.2-2.7z" />
    </IconSvg>
  )
}

export function NetworkIcon(props: WaterSourceIconProps) {
  return (
    <IconSvg {...props}>
      <path d="M2.6 13.2h7.2" />
      <path d="M17.6 13.2h3.8" />
      <circle cx="6.2" cy="13.2" r="1.35" />
      <path d="M6.2 11.85V6.4M4.5 6.4h3.4" />
      <circle cx="14.6" cy="13.2" r="4.05" />
      <path d="M14.6 13.2 16.7 10.7" />
      <path d="M14.6 10.15v.8M17.55 13.2h.8M14.6 15.45v.8M11.65 13.2h.8" />
    </IconSvg>
  )
}

export function CanalIcon(props: WaterSourceIconProps) {
  return (
    <IconSvg {...props}>
      <path
        d="M3 7.4h18v9.2H3z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="none"
      />
      <path d="M3 7.4h18M3 16.6h18" />
      <path d="M4.2 12q2.4-2.4 4.8 0t4.8 0 4.8 0" />
    </IconSvg>
  )
}

const BY_KIND: Record<WaterKind, ComponentType<WaterSourceIconProps>> = {
  well: WellIcon,
  borehole: BoreholeIcon,
  tank: TankIcon,
  rain_tank: RainTankIcon,
  network: NetworkIcon,
  canal: CanalIcon,
}

export function WaterSourceIcon({
  kind,
  ...props
}: WaterSourceIconProps & { kind: WaterKind }) {
  const Icon = BY_KIND[kind] ?? TankIcon
  return <Icon {...props} />
}
