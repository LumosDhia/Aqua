import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Donkey(props: AnimalArtProps) {
  return (
    <AnimalSvg species="donkey" {...props}>
      <ellipse className="animal-shadow" cx="64" cy="92" rx="32" ry="5.5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-tail">
        <path
          d="M92 50c10 8 8 24 2 30"
          fill="none"
          stroke="#8a8478"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path d="M92 78c3 6-1 10-6 9 2-2 4-5 6-9Z" fill="#5c574e" />
      </g>
      <g className="animal-body">
        <ellipse cx="66" cy="58" rx="28" ry="17" fill="#c4b8a8" stroke="#a89888" strokeWidth="2" />
        <path d="M52 44h28" stroke="#8a8478" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="48" y="72" width="6" height="18" rx="3" fill="#b8ac9c" stroke="#a89888" strokeWidth="1.2" />
        <rect x="58" y="74" width="6" height="17" rx="3" fill="#b8ac9c" stroke="#a89888" strokeWidth="1.2" />
        <rect x="72" y="74" width="6" height="17" rx="3" fill="#b8ac9c" stroke="#a89888" strokeWidth="1.2" />
        <rect x="82" y="72" width="6" height="18" rx="3" fill="#b8ac9c" stroke="#a89888" strokeWidth="1.2" />
      </g>
      <g className="animal-head">
        <path d="M48 48c-6-12-14-18-20-16-1 9 4 20 12 26Z" fill="#c4b8a8" stroke="#a89888" strokeWidth="2" />
        <ellipse cx="24" cy="36" rx="10" ry="11" fill="#c4b8a8" stroke="#a89888" strokeWidth="2" />
        <ellipse cx="18" cy="44" rx="7" ry="5.5" fill="#8a8478" stroke="#6b6458" strokeWidth="1.2" />
        <g className="animal-ear">
          <ellipse cx="30" cy="14" rx="4.5" ry="14" fill="#c4b8a8" stroke="#a89888" strokeWidth="1.3" />
          <ellipse cx="30" cy="14" rx="2" ry="8" fill="#f0c4b6" />
        </g>
        <ellipse cx="18" cy="14" rx="4.2" ry="13" fill="#c4b8a8" stroke="#a89888" strokeWidth="1.3" />
        <ellipse cx="18" cy="14" rx="1.8" ry="7" fill="#f0c4b6" />
        <circle cx="22" cy="34" r="1.8" fill="#3f2a18" />
        <circle cx="22.5" cy="33.5" r="0.5" fill="#f6f1e4" />
        <path d="M14 46c2 2 6 2 8 0" fill="none" stroke="#6b6458" strokeWidth="1.3" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
