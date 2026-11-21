import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Rabbit(props: AnimalArtProps) {
  return (
    <AnimalSvg species="rabbit" {...props}>
      <ellipse className="animal-shadow" cx="62" cy="90" rx="26" ry="5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-body">
        <ellipse cx="66" cy="68" rx="24" ry="18" fill="#e8e0d0" stroke="#cfc4b0" strokeWidth="2" />
        <circle cx="88" cy="72" r="8" fill="#f6f1e4" stroke="#cfc4b0" strokeWidth="1.4" />
        <ellipse cx="56" cy="84" rx="6" ry="4" fill="#d9d0b8" />
        <ellipse cx="74" cy="84" rx="6" ry="4" fill="#d9d0b8" />
      </g>
      <g className="animal-head">
        <g className="animal-ear">
          <ellipse cx="48" cy="22" rx="7" ry="20" fill="#e8e0d0" stroke="#cfc4b0" strokeWidth="1.6" />
          <ellipse cx="48" cy="22" rx="3.2" ry="14" fill="#f0c4b6" />
        </g>
        <ellipse cx="60" cy="20" rx="6.5" ry="18" fill="#e8e0d0" stroke="#cfc4b0" strokeWidth="1.6" />
        <ellipse cx="60" cy="20" rx="2.8" ry="12" fill="#f0c4b6" />
        <ellipse cx="52" cy="52" rx="16" ry="14" fill="#e8e0d0" stroke="#cfc4b0" strokeWidth="2" />
        <circle cx="46" cy="50" r="2" fill="#3f5f50" />
        <circle cx="58" cy="50" r="2" fill="#3f5f50" />
        <circle cx="46.6" cy="49.4" r="0.55" fill="#f6f1e4" />
        <g className="animal-nose">
          <ellipse cx="52" cy="56" rx="3.2" ry="2.4" fill="#e8b4a8" />
        </g>
        <path d="M48 60c3 2.6 8 2.6 11 0" fill="none" stroke="#cfc4b0" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M42 58h-8M62 58h8" stroke="#cfc4b0" strokeWidth="1" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
