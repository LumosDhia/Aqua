import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Pig(props: AnimalArtProps) {
  return (
    <AnimalSvg species="pig" {...props}>
      <ellipse className="animal-shadow" cx="62" cy="90" rx="30" ry="6" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path
          d="M92 58c8-6 4 2 0 4 6 1 8-6 4-8"
          fill="none"
          stroke="#e0a090"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </g>
      <g className="animal-body">
        <ellipse cx="64" cy="60" rx="30" ry="22" fill="#f0c4b6" stroke="#d9a090" strokeWidth="2" />
        <ellipse cx="70" cy="58" rx="8" ry="6" fill="#e8b4a8" />
        <rect x="46" y="76" width="7" height="12" rx="3.5" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.2" />
        <rect x="58" y="78" width="7" height="11" rx="3.5" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.2" />
        <rect x="70" y="78" width="7" height="11" rx="3.5" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.2" />
        <rect x="82" y="76" width="7" height="12" rx="3.5" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.2" />
      </g>
      <g className="animal-head">
        <ellipse cx="32" cy="56" rx="18" ry="16" fill="#f0c4b6" stroke="#d9a090" strokeWidth="2" />
        <g className="animal-ear">
          <path d="M40 42 48 28c6 4 4 12-2 16Z" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.3" />
          <path d="M42 40 46 32c3 2 2 7-1 10Z" fill="#f6d0c8" />
        </g>
        <path d="M24 42 16 28c-6 4-4 12 2 16Z" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.3" />
        <g className="animal-snout">
          <ellipse cx="18" cy="60" rx="10" ry="8" fill="#e8b4a8" stroke="#d9a090" strokeWidth="1.5" />
          <ellipse cx="14" cy="60" rx="1.6" ry="2.2" fill="#c48880" />
          <ellipse cx="20" cy="60" rx="1.6" ry="2.2" fill="#c48880" />
        </g>
        <circle cx="30" cy="52" r="2" fill="#5c3a3a" />
        <circle cx="22" cy="52" r="2" fill="#5c3a3a" />
        <circle cx="30.6" cy="51.4" r="0.55" fill="#f6f1e4" />
        <path d="M24 66c3 2 8 2 11 0" fill="none" stroke="#d9a090" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
