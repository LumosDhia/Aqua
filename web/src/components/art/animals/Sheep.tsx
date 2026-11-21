import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Sheep(props: AnimalArtProps) {
  return (
    <AnimalSvg species="sheep" {...props}>
      <ellipse className="animal-shadow" cx="62" cy="90" rx="32" ry="6" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-body">
        <circle cx="50" cy="56" r="18" fill="#f6f1e4" stroke="#d9d0b8" strokeWidth="2" />
        <circle cx="68" cy="54" r="16" fill="#faf6eb" stroke="#d9d0b8" strokeWidth="2" />
        <circle cx="62" cy="66" r="15" fill="#f3ead4" stroke="#d9d0b8" strokeWidth="2" />
        <circle cx="78" cy="64" r="12" fill="#f6f1e4" stroke="#d9d0b8" strokeWidth="1.6" />
        <circle cx="46" cy="68" r="11" fill="#faf6eb" stroke="#d9d0b8" strokeWidth="1.6" />
        <rect x="48" y="76" width="6" height="14" rx="3" fill="#6b6458" />
        <rect x="58" y="78" width="6" height="13" rx="3" fill="#6b6458" />
        <rect x="70" y="78" width="6" height="13" rx="3" fill="#6b6458" />
        <rect x="80" y="76" width="6" height="14" rx="3" fill="#6b6458" />
      </g>
      <g className="animal-tail">
        <circle cx="90" cy="58" r="6" fill="#f6f1e4" stroke="#d9d0b8" strokeWidth="1.4" />
      </g>
      <g className="animal-head">
        <ellipse cx="32" cy="58" rx="12" ry="13" fill="#6b6458" stroke="#534e45" strokeWidth="1.6" />
        <g className="animal-ear">
          <ellipse cx="40" cy="48" rx="5" ry="7" fill="#6b6458" stroke="#534e45" strokeWidth="1.2" />
          <ellipse cx="40" cy="48" rx="2.4" ry="3.6" fill="#f0c4b6" />
        </g>
        <ellipse cx="24" cy="48" rx="5" ry="7" fill="#6b6458" stroke="#534e45" strokeWidth="1.2" />
        <g className="animal-eye">
          <circle cx="28" cy="56" r="2" fill="#f6f1e4" />
          <circle cx="36" cy="56" r="2" fill="#f6f1e4" />
          <circle cx="28.4" cy="56.2" r="1.1" fill="#241f1a" />
          <circle cx="36.4" cy="56.2" r="1.1" fill="#241f1a" />
        </g>
        <path d="M28 64c3 2.4 8 2.4 11 0" fill="none" stroke="#4a453c" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
