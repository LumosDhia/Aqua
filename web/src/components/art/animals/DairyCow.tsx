import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function DairyCow(props: AnimalArtProps) {
  return (
    <AnimalSvg species="dairy_cow" {...props}>
      <ellipse className="animal-shadow" cx="62" cy="90" rx="36" ry="6" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path
          d="M92 52c12 4 14 22 8 30"
          fill="none"
          stroke="#e8d9b8"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M98 80c2 4-2 8-6 7 3-1 4-4 6-7Z" fill="#5c574e" />
      </g>
      <g className="animal-body">
        <ellipse cx="64" cy="58" rx="34" ry="22" fill="#f3ead4" stroke="#d4c4a0" strokeWidth="2" />
        <ellipse cx="50" cy="54" rx="10" ry="8" fill="#3f5f50" />
        <ellipse cx="74" cy="64" rx="9" ry="7" fill="#3f5f50" />
        <ellipse cx="78" cy="48" rx="6" ry="5" fill="#3f5f50" />
        <rect x="42" y="74" width="7" height="16" rx="3.5" fill="#ebe0c4" stroke="#d4c4a0" strokeWidth="1.4" />
        <rect x="54" y="76" width="7" height="15" rx="3.5" fill="#ebe0c4" stroke="#d4c4a0" strokeWidth="1.4" />
        <rect x="68" y="76" width="7" height="15" rx="3.5" fill="#ebe0c4" stroke="#d4c4a0" strokeWidth="1.4" />
        <rect x="80" y="74" width="7" height="16" rx="3.5" fill="#ebe0c4" stroke="#d4c4a0" strokeWidth="1.4" />
        <ellipse cx="58" cy="78" rx="8" ry="5" fill="#f0c4b6" stroke="#d9a090" strokeWidth="1.2" />
      </g>
      <g className="animal-head">
        <ellipse cx="28" cy="50" rx="16" ry="14" fill="#f3ead4" stroke="#d4c4a0" strokeWidth="2" />
        <ellipse cx="18" cy="54" rx="9" ry="7" fill="#f6f1e4" stroke="#d4c4a0" strokeWidth="1.4" />
        <g className="animal-ear">
          <ellipse cx="34" cy="38" rx="6" ry="8" fill="#e8d9b8" stroke="#d4c4a0" strokeWidth="1.3" />
          <ellipse cx="34" cy="38" rx="3" ry="4.5" fill="#f0c4b6" />
        </g>
        <ellipse cx="22" cy="40" rx="5" ry="7" fill="#e8d9b8" stroke="#d4c4a0" strokeWidth="1.3" />
        <circle cx="24" cy="48" r="2.1" fill="#3f5f50" />
        <circle cx="16" cy="49" r="2.1" fill="#3f5f50" />
        <circle cx="24.6" cy="47.4" r="0.6" fill="#f6f1e4" />
        <circle cx="16.6" cy="48.4" r="0.6" fill="#f6f1e4" />
        <path d="M14 56c3 3 8 3 11 0" fill="none" stroke="#c4a882" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="12" cy="54" rx="1.4" ry="1" fill="#d9a090" />
        <ellipse cx="16" cy="54.4" rx="1.4" ry="1" fill="#d9a090" />
      </g>
    </AnimalSvg>
  )
}
