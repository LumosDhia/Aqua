import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function BeefCattle(props: AnimalArtProps) {
  return (
    <AnimalSvg species="beef_cattle" {...props}>
      <ellipse className="animal-shadow" cx="62" cy="90" rx="36" ry="6" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path
          d="M94 50c11 6 12 22 6 30"
          fill="none"
          stroke="#8a5a38"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path d="M98 78c2 5-2 9-7 8 3-1 4-4 7-8Z" fill="#5c3a24" />
      </g>
      <g className="animal-body">
        <ellipse cx="64" cy="58" rx="34" ry="23" fill="#c48a58" stroke="#a06c40" strokeWidth="2" />
        <ellipse cx="72" cy="52" rx="12" ry="9" fill="#b07848" />
        <rect x="42" y="74" width="7.5" height="16" rx="3.5" fill="#b07848" stroke="#a06c40" strokeWidth="1.4" />
        <rect x="54" y="76" width="7.5" height="15" rx="3.5" fill="#b07848" stroke="#a06c40" strokeWidth="1.4" />
        <rect x="68" y="76" width="7.5" height="15" rx="3.5" fill="#b07848" stroke="#a06c40" strokeWidth="1.4" />
        <rect x="80" y="74" width="7.5" height="16" rx="3.5" fill="#b07848" stroke="#a06c40" strokeWidth="1.4" />
      </g>
      <g className="animal-head">
        <path d="M22 34c-2-8 2-12 6-12 2 4 2 8 0 12Z" fill="#e8c58a" stroke="#c4a06a" strokeWidth="1.2" />
        <path d="M36 34c2-8-2-12-6-12-2 4-2 8 0 12Z" fill="#e8c58a" stroke="#c4a06a" strokeWidth="1.2" />
        <ellipse cx="28" cy="50" rx="16" ry="14" fill="#c48a58" stroke="#a06c40" strokeWidth="2" />
        <ellipse cx="18" cy="54" rx="9" ry="7" fill="#d4a074" stroke="#a06c40" strokeWidth="1.4" />
        <g className="animal-ear">
          <ellipse cx="36" cy="40" rx="6" ry="8" fill="#b07848" stroke="#a06c40" strokeWidth="1.3" />
          <ellipse cx="36" cy="40" rx="3" ry="4.5" fill="#e0a888" />
        </g>
        <ellipse cx="22" cy="40" rx="5" ry="7" fill="#b07848" stroke="#a06c40" strokeWidth="1.3" />
        <circle cx="24" cy="48" r="2.1" fill="#3f2a18" />
        <circle cx="16" cy="49" r="2.1" fill="#3f2a18" />
        <circle cx="24.6" cy="47.4" r="0.6" fill="#f6f1e4" />
        <circle cx="16.6" cy="48.4" r="0.6" fill="#f6f1e4" />
        <path d="M14 56c3 3 8 3 11 0" fill="none" stroke="#8a5a38" strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
