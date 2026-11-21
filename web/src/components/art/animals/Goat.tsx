import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Goat(props: AnimalArtProps) {
  return (
    <AnimalSvg species="goat" {...props}>
      <ellipse className="animal-shadow" cx="64" cy="90" rx="30" ry="5.5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path d="M92 52c8-8 6-2 2 6" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.4" strokeLinejoin="round" />
      </g>
      <g className="animal-body">
        <ellipse cx="66" cy="60" rx="28" ry="18" fill="#e6d5b0" stroke="#c4ad86" strokeWidth="2" />
        <rect x="48" y="74" width="6" height="16" rx="3" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.2" />
        <rect x="58" y="76" width="6" height="15" rx="3" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.2" />
        <rect x="70" y="76" width="6" height="15" rx="3" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.2" />
        <rect x="80" y="74" width="6" height="16" rx="3" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.2" />
      </g>
      <g className="animal-head">
        <path d="M24 32c-1-9 4-14 8-14 1 5 1 10-1 14Z" fill="#f6f1e4" stroke="#c4ad86" strokeWidth="1.2" />
        <path d="M40 32c1-9-4-14-8-14-1 5-1 10 1 14Z" fill="#f6f1e4" stroke="#c4ad86" strokeWidth="1.2" />
        <ellipse cx="32" cy="50" rx="14" ry="13" fill="#e6d5b0" stroke="#c4ad86" strokeWidth="2" />
        <ellipse cx="24" cy="56" rx="8" ry="6" fill="#f3ead4" stroke="#c4ad86" strokeWidth="1.3" />
        <g className="animal-ear">
          <ellipse cx="42" cy="42" rx="5" ry="8" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.2" />
          <ellipse cx="42" cy="42" rx="2.2" ry="4" fill="#f0c4b6" />
        </g>
        <ellipse cx="22" cy="42" rx="4.5" ry="7" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1.2" />
        <circle cx="28" cy="48" r="1.9" fill="#3f5f50" />
        <circle cx="20" cy="49" r="1.9" fill="#3f5f50" />
        <circle cx="28.5" cy="47.5" r="0.5" fill="#f6f1e4" />
        <path d="M22 58c2 2 6 2 8 0" fill="none" stroke="#c4ad86" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M26 62c0 6-3 9-1 10 3-1 4-6 3-10" fill="#d9c4a0" stroke="#c4ad86" strokeWidth="1" />
      </g>
    </AnimalSvg>
  )
}
