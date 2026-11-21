import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Horse(props: AnimalArtProps) {
  return (
    <AnimalSvg species="horse" {...props}>
      <ellipse className="animal-shadow" cx="64" cy="92" rx="34" ry="5.5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path
          d="M94 48c14 2 12 28 4 36 4-8 6-22-4-36Z"
          fill="#6b3f24"
          stroke="#5a331c"
          strokeWidth="1.4"
        />
      </g>
      <g className="animal-body">
        <ellipse cx="66" cy="56" rx="30" ry="18" fill="#b07848" stroke="#8a5a38" strokeWidth="2" />
        <rect x="46" y="70" width="6.5" height="20" rx="3.2" fill="#9a6840" stroke="#8a5a38" strokeWidth="1.2" />
        <rect x="56" y="72" width="6.5" height="19" rx="3.2" fill="#9a6840" stroke="#8a5a38" strokeWidth="1.2" />
        <rect x="72" y="72" width="6.5" height="19" rx="3.2" fill="#9a6840" stroke="#8a5a38" strokeWidth="1.2" />
        <rect x="82" y="70" width="6.5" height="20" rx="3.2" fill="#9a6840" stroke="#8a5a38" strokeWidth="1.2" />
        <rect x="46" y="86" width="7" height="4" rx="1.5" fill="#3f2a18" />
        <rect x="56" y="87" width="7" height="4" rx="1.5" fill="#3f2a18" />
        <rect x="72" y="87" width="7" height="4" rx="1.5" fill="#3f2a18" />
        <rect x="82" y="86" width="7" height="4" rx="1.5" fill="#3f2a18" />
      </g>
      <g className="animal-head">
        <path d="M48 46c-8-16-16-22-22-20-2 10 4 22 14 28Z" fill="#b07848" stroke="#8a5a38" strokeWidth="2" />
        <ellipse cx="22" cy="32" rx="10" ry="12" fill="#b07848" stroke="#8a5a38" strokeWidth="2" />
        <ellipse cx="16" cy="40" rx="7" ry="6" fill="#c48a58" stroke="#8a5a38" strokeWidth="1.3" />
        <path d="M28 18c4-8 10-6 12 2-6 1-10 4-12-2Z" fill="#6b3f24" />
        <g className="animal-ear">
          <ellipse cx="28" cy="18" rx="4" ry="8" fill="#b07848" stroke="#8a5a38" strokeWidth="1.2" />
          <ellipse cx="28" cy="18" rx="1.8" ry="4" fill="#e0a888" />
        </g>
        <ellipse cx="18" cy="16" rx="3.6" ry="7" fill="#b07848" stroke="#8a5a38" strokeWidth="1.2" />
        <circle cx="20" cy="30" r="1.8" fill="#3f2a18" />
        <circle cx="20.5" cy="29.5" r="0.5" fill="#f6f1e4" />
        <path d="M12 42c2 2 6 2 8 0" fill="none" stroke="#8a5a38" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
