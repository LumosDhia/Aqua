import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Camel(props: AnimalArtProps) {
  return (
    <AnimalSvg species="camel" {...props}>
      <ellipse className="animal-shadow" cx="64" cy="92" rx="34" ry="5.5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path
          d="M96 58c10 4 8 20 2 24"
          fill="none"
          stroke="#c48a58"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path d="M96 80c2 5-2 8-6 7 2-1 4-3 6-7Z" fill="#8a5a38" />
      </g>
      <g className="animal-body">
        <ellipse cx="68" cy="62" rx="30" ry="16" fill="#d4a074" stroke="#b07848" strokeWidth="2" />
        <ellipse cx="70" cy="42" rx="16" ry="14" fill="#d4a074" stroke="#b07848" strokeWidth="2" />
        <ellipse cx="70" cy="34" rx="10" ry="8" fill="#c48a58" />
        <rect x="48" y="74" width="6" height="16" rx="3" fill="#c48a58" stroke="#b07848" strokeWidth="1.2" />
        <rect x="58" y="76" width="6" height="15" rx="3" fill="#c48a58" stroke="#b07848" strokeWidth="1.2" />
        <rect x="74" y="76" width="6" height="15" rx="3" fill="#c48a58" stroke="#b07848" strokeWidth="1.2" />
        <rect x="84" y="74" width="6" height="16" rx="3" fill="#c48a58" stroke="#b07848" strokeWidth="1.2" />
      </g>
      <g className="animal-neck">
        <path
          d="M46 56c-8-18-18-28-28-26 2 8 8 22 18 30Z"
          fill="#d4a074"
          stroke="#b07848"
          strokeWidth="2"
        />
        <g className="animal-head">
          <ellipse cx="16" cy="28" rx="11" ry="10" fill="#d4a074" stroke="#b07848" strokeWidth="2" />
          <ellipse cx="8" cy="32" rx="7" ry="5" fill="#c48a58" stroke="#b07848" strokeWidth="1.2" />
          <g className="animal-ear">
            <ellipse cx="22" cy="18" rx="3.5" ry="7" fill="#c48a58" stroke="#b07848" strokeWidth="1.1" />
          </g>
          <ellipse cx="12" cy="18" rx="3.2" ry="6.5" fill="#c48a58" stroke="#b07848" strokeWidth="1.1" />
          <circle cx="14" cy="26" r="1.7" fill="#3f2a18" />
          <circle cx="14.5" cy="25.5" r="0.5" fill="#f6f1e4" />
          <path d="M4 34c2 2 6 2 8 0" fill="none" stroke="#b07848" strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </g>
    </AnimalSvg>
  )
}
