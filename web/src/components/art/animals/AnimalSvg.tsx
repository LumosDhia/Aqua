import type { ReactNode, SVGProps } from 'react'

export type AnimalArtProps = {
  size?: number
  animate?: boolean
  className?: string
  title?: string
} & Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children' | 'width' | 'height'>

export function AnimalSvg({
  size = 120,
  animate = true,
  className,
  title,
  species,
  children,
  ...rest
}: AnimalArtProps & { species: string; children: ReactNode }) {
  const cls = [
    'animal-art',
    `animal-${species}`,
    animate ? 'is-animated' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
      viewBox="0 0 120 100"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      className={cls}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}
