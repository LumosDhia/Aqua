export function Farmhouse({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden="true">
      <ellipse cx="36" cy="62" rx="32" ry="6" fill="#d9d0b8" opacity="0.45" />
      <rect x="10" y="28" width="52" height="32" rx="4" fill="#f6f1e4" stroke="#d4c4a0" strokeWidth="1.6" />
      <path d="M6 30 36 8l30 22Z" fill="#c48a58" stroke="#a06c40" strokeWidth="1.6" strokeLinejoin="round" />
      <rect x="14" y="12" width="8" height="12" rx="1.5" fill="#d4c4a0" stroke="#b89870" strokeWidth="1.1" />
      <rect x="30" y="38" width="12" height="22" rx="1.5" fill="#8a6244" stroke="#6e4c34" strokeWidth="1.2" />
      <circle cx="39.5" cy="49" r="1.2" fill="#e8c58a" />
      <rect x="16" y="36" width="10" height="10" rx="1.5" fill="#8fbc78" stroke="#5a8a4e" strokeWidth="1.1" />
      <rect x="46" y="36" width="10" height="10" rx="1.5" fill="#8fbc78" stroke="#5a8a4e" strokeWidth="1.1" />
      <path d="M16 41h10M46 41h10M21 36v10M51 36v10" stroke="#f6f1e4" strokeWidth="0.8" />
    </g>
  )
}

export function Cloud({
  x,
  y,
  scale = 1,
  className,
}: {
  x: number
  y: number
  scale?: number
  className?: string
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <g className={className}>
        <ellipse cx="28" cy="16" rx="22" ry="10" fill="#fffcf6" opacity="0.92" />
        <ellipse cx="16" cy="18" rx="12" ry="8" fill="#fffcf6" opacity="0.92" />
        <ellipse cx="40" cy="18" rx="14" ry="9" fill="#fffcf6" opacity="0.92" />
      </g>
    </g>
  )
}
