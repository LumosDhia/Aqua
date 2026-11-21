import { resolveCrop, type KnownCrop } from '../crops'
import { cropColor } from '../../../lib/status'

export function patternId(uid: string, crop: string): string {
  return `${uid}-crop-${resolveCrop(crop)}`
}

export function CropPatternDefs({ uid, crops }: { uid: string; crops: string[] }) {
  const seen = new Set<KnownCrop>()
  const unique: KnownCrop[] = []
  for (const crop of crops) {
    const kind = resolveCrop(crop)
    if (seen.has(kind)) continue
    seen.add(kind)
    unique.push(kind)
  }

  return (
    <>
      {unique.map((crop) => (
        <pattern
          key={crop}
          id={patternId(uid, crop)}
          patternUnits="userSpaceOnUse"
          width={tileSize(crop)}
          height={tileSize(crop)}
        >
          <CropTile crop={crop} />
        </pattern>
      ))}
    </>
  )
}

function tileSize(crop: KnownCrop): number {
  if (crop === 'olives' || crop === 'almonds' || crop === 'citrus' || crop === 'dates') return 28
  if (crop === 'wheat' || crop === 'barley') return 10
  return 14
}

function CropTile({ crop }: { crop: KnownCrop }) {
  const accent = cropColor(crop)
  switch (crop) {
    case 'olives':
    case 'almonds':
    case 'citrus':
    case 'dates':
      return (
        <>
          <rect width="28" height="28" fill="#e4edc8" />
          <circle cx="14" cy="12" r="8" fill={crop === 'dates' ? '#6aa35c' : '#7cb069'} stroke="#5a8a4e" strokeWidth="1" />
          <rect x="12.4" y="18" width="3.2" height="6" rx="1" fill="#8a6244" />
          {crop === 'citrus' ? <circle cx="16" cy="11" r="2.2" fill={accent} /> : null}
          {crop === 'olives' || crop === 'almonds' ? (
            <ellipse cx="11" cy="13" rx="1.4" ry="2" fill={accent} />
          ) : null}
        </>
      )
    case 'wheat':
    case 'barley':
      return (
        <>
          <rect width="10" height="10" fill="#efe4c4" />
          <rect x="0" y="0" width="4.5" height="10" fill={accent} opacity="0.45" />
          <rect x="6" y="0" width="2" height="10" fill="#d4a054" opacity="0.35" />
        </>
      )
    case 'grapes':
      return (
        <>
          <rect width="14" height="14" fill="#e4edc8" />
          <path d="M1 4h12M1 10h12" fill="none" stroke="#6aa35c" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="5" cy="7" r="1.6" fill="#80528a" />
          <circle cx="9" cy="7" r="1.6" fill="#80528a" />
        </>
      )
    case 'tomatoes':
    case 'peppers':
    case 'potatoes':
    default:
      return (
        <>
          <rect width="14" height="14" fill="#e4edc8" />
          <rect x="1" y="5" width="12" height="4" rx="2" fill={crop === 'generic' ? '#7cb069' : accent} opacity="0.7" />
          <rect x="1" y="5.6" width="12" height="1.4" rx="0.7" fill="#5a8a4e" opacity="0.35" />
        </>
      )
  }
}
