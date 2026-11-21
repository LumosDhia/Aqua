import type { ReactNode, SVGProps } from 'react'
import { cropColor } from '../../../lib/status'
import './crops.css'

export type KnownCrop =
  | 'tomatoes'
  | 'peppers'
  | 'potatoes'
  | 'olives'
  | 'wheat'
  | 'barley'
  | 'citrus'
  | 'dates'
  | 'grapes'
  | 'almonds'
  | 'generic'

export const CROP_LABELS: Record<Exclude<KnownCrop, 'generic'>, string> = {
  tomatoes: 'Tomatoes',
  peppers: 'Peppers',
  potatoes: 'Potatoes',
  olives: 'Olives',
  wheat: 'Wheat',
  barley: 'Barley',
  citrus: 'Citrus',
  dates: 'Dates',
  grapes: 'Grapes',
  almonds: 'Almonds',
}

const CROP_ALIASES = new Map<string, KnownCrop>([
  ['tomato', 'tomatoes'],
  ['tomatoes', 'tomatoes'],
  ['pepper', 'peppers'],
  ['peppers', 'peppers'],
  ['potato', 'potatoes'],
  ['potatoes', 'potatoes'],
  ['olive', 'olives'],
  ['olives', 'olives'],
  ['wheat', 'wheat'],
  ['wheats', 'wheat'],
  ['barley', 'barley'],
  ['barleys', 'barley'],
  ['citrus', 'citrus'],
  ['citruses', 'citrus'],
  ['date', 'dates'],
  ['dates', 'dates'],
  ['grape', 'grapes'],
  ['grapes', 'grapes'],
  ['almond', 'almonds'],
  ['almonds', 'almonds'],
])

export function resolveCrop(crop: string): KnownCrop {
  return CROP_ALIASES.get(crop.trim().toLowerCase()) ?? 'generic'
}

export type CropArtProps = {
  crop: string
  size?: number
  animate?: boolean
  className?: string
  title?: string
} & Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children' | 'width' | 'height'>

export function CropDrawing({ crop }: { crop: string }) {
  const kind = resolveCrop(crop)
  const accent = cropColor(kind)
  return <CropIllustration crop={kind} accent={accent} />
}

export function CropArt({
  crop,
  size = 120,
  animate = true,
  className,
  title,
  ...rest
}: CropArtProps) {
  const kind = resolveCrop(crop)
  const cls = ['crop-art', `crop-${kind}`, animate ? 'is-animated' : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      className={cls}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <CropDrawing crop={crop} />
    </svg>
  )
}

function CropIllustration({ crop, accent }: { crop: KnownCrop; accent: string }) {
  switch (crop) {
    case 'tomatoes':
      return (
        <>
          <g className="crop-stalk">
            <path d="M60 98V42" fill="none" stroke="#4a7a4e" strokeWidth="4" strokeLinecap="round" />
            <path d="M60 72C44 60 36 52 32 44" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 64c16-10 24-18 28-28" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <ellipse cx="40" cy="58" rx="12" ry="7" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.4" transform="rotate(-28 40 58)" />
            <ellipse cx="80" cy="52" rx="13" ry="7" fill="#6aa35c" stroke="#4f8a44" strokeWidth="1.4" transform="rotate(24 80 52)" />
            <ellipse cx="52" cy="44" rx="9" ry="5" fill="#8fbc78" stroke="#5a8a4e" strokeWidth="1.2" transform="rotate(-12 52 44)" />
          </g>
          <g className="crop-head">
            <circle cx="44" cy="78" r="11" fill={accent} stroke="#9a2e24" strokeWidth="1.6" />
            <circle cx="72" cy="74" r="13" fill={accent} stroke="#9a2e24" strokeWidth="1.6" />
            <circle cx="86" cy="58" r="8" fill={accent} stroke="#9a2e24" strokeWidth="1.4" />
            <path d="M40 70c2 2 6 2 8 0M68 64c3 2 8 2 10 0M83 52c2 1.5 5 1.5 7 0" fill="none" stroke="#4a7a4e" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M40 80c1 3 3 4 5 4M70 76c1 3 3 5 6 5" fill="none" stroke="#f4cfc6" strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </>
      )
    case 'peppers':
      return (
        <>
          <g className="crop-stalk">
            <path d="M60 98V40" fill="none" stroke="#4a7a4e" strokeWidth="4" strokeLinecap="round" />
            <path d="M60 70 40 50" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 62 82 46" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <ellipse cx="42" cy="56" rx="13" ry="7" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.4" transform="rotate(-20 42 56)" />
            <ellipse cx="80" cy="50" rx="12" ry="6.5" fill="#6aa35c" stroke="#4f8a44" strokeWidth="1.4" transform="rotate(22 80 50)" />
          </g>
          <g className="crop-head">
            <path d="M38 58c8-4 16 0 16 10 0 14-8 22-20 26 4-8 4-14 1-20-2-5-2-10 3-16Z" fill={accent} stroke="#9a3c1c" strokeWidth="1.6" />
            <path d="M78 56c10-3 16 4 14 12-3 10-12 16-22 18 4-6 5-12 4-16-2-6 0-10 4-14Z" fill={accent} stroke="#9a3c1c" strokeWidth="1.6" />
            <path d="M40 58c0-4-2-6-5-8M78 56c2-4 5-6 8-7" fill="none" stroke="#4a7a4e" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        </>
      )
    case 'potatoes':
      return (
        <>
          <g className="crop-stalk">
            <path d="M60 98V50" fill="none" stroke="#4a7a4e" strokeWidth="4" strokeLinecap="round" />
            <path d="M60 78 40 60" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 72 82 58" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <ellipse cx="42" cy="64" rx="11" ry="6" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.3" transform="rotate(-18 42 64)" />
            <ellipse cx="78" cy="60" rx="11" ry="6" fill="#6aa35c" stroke="#4f8a44" strokeWidth="1.3" transform="rotate(16 78 60)" />
            <ellipse cx="50" cy="50" rx="9" ry="5" fill="#8fbc78" stroke="#5a8a4e" strokeWidth="1.2" transform="rotate(-8 50 50)" />
            <ellipse cx="70" cy="48" rx="9" ry="5" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.2" transform="rotate(10 70 48)" />
          </g>
          <circle cx="60" cy="38" r="5" fill="#f1e7ef" stroke="#d4a054" strokeWidth="1.2" />
          <g className="crop-head">
            <ellipse cx="46" cy="96" rx="12" ry="7" fill="#e8c58a" stroke="#96663e" strokeWidth="1.5" transform="rotate(-12 46 96)" />
            <ellipse cx="74" cy="97" rx="12" ry="7" fill="#e8c58a" stroke="#96663e" strokeWidth="1.5" transform="rotate(10 74 97)" />
            <circle cx="42" cy="95" r="1.2" fill="#96663e" />
            <circle cx="50" cy="97" r="1" fill="#96663e" />
            <circle cx="70" cy="96" r="1.2" fill="#96663e" />
            <circle cx="78" cy="98" r="1" fill="#96663e" />
          </g>
        </>
      )
    case 'olives':
      return (
        <>
          <g className="crop-stalk">
            <path d="M58 98c4-22 2-40-2-54" fill="none" stroke="#8a6244" strokeWidth="6" strokeLinecap="round" />
            <path d="M60 70 44 54" fill="none" stroke="#8a6244" strokeWidth="4" strokeLinecap="round" />
            <path d="M62 64 80 48" fill="none" stroke="#8a6244" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g className="crop-canopy">
            <ellipse cx="60" cy="44" rx="32" ry="24" fill="#7cb069" stroke="#5a8a4e" strokeWidth="2" />
            <ellipse cx="46" cy="40" rx="14" ry="12" fill="#8fbc78" />
            <ellipse cx="74" cy="38" rx="13" ry="11" fill="#6aa35c" />
          </g>
          <g className="crop-head">
            <ellipse cx="44" cy="52" rx="3.4" ry="5" fill={accent} stroke="#286052" strokeWidth="1.1" />
            <ellipse cx="68" cy="40" rx="3.4" ry="5" fill={accent} stroke="#286052" strokeWidth="1.1" />
            <ellipse cx="80" cy="52" rx="3.4" ry="5" fill={accent} stroke="#286052" strokeWidth="1.1" />
            <ellipse cx="52" cy="34" rx="3.4" ry="5" fill={accent} stroke="#286052" strokeWidth="1.1" />
          </g>
        </>
      )
    case 'wheat':
      return (
        <>
          <g className="crop-stalk">
            <path d="M60 98V38" fill="none" stroke="#c4a05a" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M60 90 42 52" fill="none" stroke="#c4a05a" strokeWidth="2.6" strokeLinecap="round" />
            <path d="M60 90 78 54" fill="none" stroke="#c4a05a" strokeWidth="2.6" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <ellipse cx="44" cy="78" rx="14" ry="5" fill="#8fbc78" stroke="#6a944e" strokeWidth="1.2" transform="rotate(-28 44 78)" />
            <ellipse cx="76" cy="76" rx="14" ry="5" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.2" transform="rotate(26 76 76)" />
          </g>
          <g className="crop-head">
            <WheatHead cx={60} cy={36} fill={accent} />
            <WheatHead cx={42} cy={50} fill={accent} rotate={-18} />
            <WheatHead cx={78} cy={52} fill={accent} rotate={16} />
          </g>
        </>
      )
    case 'barley':
      return (
        <>
          <g className="crop-stalk">
            <path d="M58 98 48 44" fill="none" stroke="#c4a05a" strokeWidth="2.8" strokeLinecap="round" />
            <path d="M60 98V36" fill="none" stroke="#c4a05a" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M62 98 76 48" fill="none" stroke="#c4a05a" strokeWidth="2.8" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <ellipse cx="42" cy="80" rx="14" ry="5" fill="#8fbc78" stroke="#6a944e" strokeWidth="1.2" transform="rotate(-30 42 80)" />
            <ellipse cx="78" cy="78" rx="14" ry="5" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.2" transform="rotate(28 78 78)" />
          </g>
          <g className="crop-head">
            <BarleyHead cx={48} cy={42} rotate={-20} />
            <BarleyHead cx={60} cy={32} rotate={4} />
            <BarleyHead cx={76} cy={44} rotate={22} />
          </g>
        </>
      )
    case 'citrus':
      return (
        <>
          <g className="crop-stalk">
            <path d="M58 98c4-24 1-42-2-56" fill="none" stroke="#8a6244" strokeWidth="6" strokeLinecap="round" />
            <path d="M60 68 44 52" fill="none" stroke="#8a6244" strokeWidth="4" strokeLinecap="round" />
            <path d="M62 62 78 46" fill="none" stroke="#8a6244" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g className="crop-canopy">
            <ellipse cx="60" cy="44" rx="34" ry="26" fill="#7cb069" stroke="#5a8a4e" strokeWidth="2" />
            <ellipse cx="44" cy="40" rx="14" ry="12" fill="#8fbc78" />
            <ellipse cx="76" cy="36" rx="14" ry="12" fill="#6aa35c" />
          </g>
          <g className="crop-head">
            <circle cx="44" cy="52" r="9" fill={accent} stroke="#bd742f" strokeWidth="1.5" />
            <circle cx="62" cy="34" r="8" fill={accent} stroke="#bd742f" strokeWidth="1.5" />
            <circle cx="80" cy="48" r="10" fill={accent} stroke="#bd742f" strokeWidth="1.5" />
            <circle cx="60" cy="62" r="8" fill={accent} stroke="#bd742f" strokeWidth="1.5" />
          </g>
        </>
      )
    case 'dates':
      return (
        <>
          <g className="crop-stalk">
            <path d="M56 98c4-28 8-48 10-66" fill="none" stroke="#a98152" strokeWidth="8" strokeLinecap="round" />
            <path d="M56 86 64 90M58 74 64 78M60 62 66 66" fill="none" stroke="#74563e" strokeWidth="1.6" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <path d="M66 36C50 18 32 20 22 28c18 0 30 8 38 16-24-8-40 2-44 12 18-6 30-4 44 0-14 4-22 14-22 24 10-10 18-16 28-18 12 4 20 12 26 20 0-14-8-22-22-26 16 0 30 4 40 14-6-16-22-24-38-14 8-10 18-16 32-16-14-8-30-2-38 18Z" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.6" />
          </g>
          <g className="crop-head">
            <ellipse cx="72" cy="50" rx="3.4" ry="5" fill={accent} />
            <ellipse cx="78" cy="54" rx="3.4" ry="5" fill={accent} />
            <ellipse cx="70" cy="58" rx="3.4" ry="5" fill={accent} />
            <ellipse cx="62" cy="52" rx="3.4" ry="5" fill={accent} />
          </g>
        </>
      )
    case 'grapes':
      return (
        <>
          <g className="crop-stalk">
            <path d="M28 96V36h64v60" fill="none" stroke="#a67850" strokeWidth="3.2" strokeLinecap="round" />
            <path d="M28 56h64M28 76h64" fill="none" stroke="#a67850" strokeWidth="2.4" />
            <path d="M50 96c-4-16 16-20 12-34-2-8-16-8-12-20 4-10 22-16 28-8" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <path d="M48 56c-12 0-20-6-20-6l4-6-10-4 8-4 0-8 8 4 6-4 4 8c8 2 10 10 6 20Z" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.3" />
            <path d="M70 52c4-12 12-18 20-20 2 8-2 16-10 22 8 2 12 8 10 14-10 4-22 0-20-16Z" fill="#6aa35c" stroke="#4f8a44" strokeWidth="1.3" />
          </g>
          <g className="crop-head">
            <circle cx="58" cy="64" r="6" fill="#80528a" stroke="#624068" strokeWidth="1" />
            <circle cx="68" cy="64" r="6" fill="#80528a" stroke="#624068" strokeWidth="1" />
            <circle cx="54" cy="72" r="6" fill="#80528a" stroke="#624068" strokeWidth="1" />
            <circle cx="64" cy="73" r="6" fill="#6e4478" stroke="#624068" strokeWidth="1" />
            <circle cx="74" cy="72" r="6" fill="#80528a" stroke="#624068" strokeWidth="1" />
            <circle cx="59" cy="81" r="6" fill="#6e4478" stroke="#624068" strokeWidth="1" />
            <circle cx="69" cy="81" r="6" fill="#80528a" stroke="#624068" strokeWidth="1" />
            <circle cx="64" cy="88" r="5" fill="#6e4478" stroke="#624068" strokeWidth="1" />
          </g>
        </>
      )
    case 'almonds':
      return (
        <>
          <g className="crop-stalk">
            <path d="M60 98c0-28-8-40-16-50" fill="none" stroke="#8a6244" strokeWidth="5.5" strokeLinecap="round" />
            <path d="M60 70 82 42" fill="none" stroke="#8a6244" strokeWidth="4" strokeLinecap="round" />
            <path d="M58 66 36 50" fill="none" stroke="#8a6244" strokeWidth="4" strokeLinecap="round" />
          </g>
          <g className="crop-canopy">
            <ellipse cx="58" cy="44" rx="34" ry="26" fill="#8fbc78" stroke="#5a8a4e" strokeWidth="2" />
            <ellipse cx="42" cy="42" rx="14" ry="12" fill="#7cb069" />
            <ellipse cx="74" cy="36" rx="14" ry="12" fill="#6aa35c" />
          </g>
          <g className="crop-head">
            <Almond x={38} y={40} />
            <Almond x={54} y={52} />
            <Almond x={76} y={28} />
            <Almond x={88} y={44} />
          </g>
        </>
      )
    case 'generic':
      return (
        <>
          <g className="crop-stalk">
            <path d="M60 98V40" fill="none" stroke="#4a7a4e" strokeWidth="4" strokeLinecap="round" />
            <path d="M60 74 38 56" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
            <path d="M60 66 84 48" fill="none" stroke="#4a7a4e" strokeWidth="3" strokeLinecap="round" />
          </g>
          <g className="crop-leaf">
            <ellipse cx="40" cy="60" rx="16" ry="8" fill="#7cb069" stroke="#5a8a4e" strokeWidth="1.4" transform="rotate(-24 40 60)" />
            <ellipse cx="80" cy="52" rx="16" ry="8" fill="#6aa35c" stroke="#4f8a44" strokeWidth="1.4" transform="rotate(22 80 52)" />
            <ellipse cx="56" cy="42" rx="12" ry="7" fill="#8fbc78" stroke="#5a8a4e" strokeWidth="1.3" transform="rotate(-8 56 42)" />
          </g>
        </>
      )
  }
}

function WheatHead({
  cx,
  cy,
  fill,
  rotate = 0,
}: {
  cx: number
  cy: number
  fill: string
  rotate?: number
}) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotate})`}>
      <ellipse cx="0" cy="0" rx="5" ry="14" fill={fill} stroke="#a36e39" strokeWidth="1.2" />
      <ellipse cx="0" cy="-6" rx="4" ry="8" fill="#e8c58a" />
    </g>
  )
}

function BarleyHead({ cx, cy, rotate }: { cx: number; cy: number; rotate: number }) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rotate})`}>
      <ellipse cx="0" cy="4" rx="4.5" ry="12" fill="#bf953d" stroke="#a57838" strokeWidth="1.2" />
      <path d="M0-8v-10M-3-6-8-16M3-6 8-16" fill="none" stroke="#a57838" strokeWidth="1.3" strokeLinecap="round" />
    </g>
  )
}

function Almond({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="6" ry="8" fill="#f5d7df" stroke="#b97b88" strokeWidth="1.2" />
      <circle r="1.6" fill="#b97b88" />
    </g>
  )
}

export function CropArtGroup({
  crop,
  animate = true,
  children,
}: {
  crop: string
  animate?: boolean
  children?: ReactNode
}) {
  const kind = resolveCrop(crop)
  const cls = ['crop-art', `crop-${kind}`, animate ? 'is-animated' : ''].filter(Boolean).join(' ')
  return <g className={cls}>{children ?? <CropDrawing crop={crop} />}</g>
}
