import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Turkey(props: AnimalArtProps) {
  return (
    <AnimalSvg species="turkey" {...props}>
      <ellipse className="animal-shadow" cx="58" cy="90" rx="28" ry="5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-body">
        <g className="animal-tail">
          <ellipse cx="86" cy="48" rx="8" ry="22" fill="#c4785a" stroke="#a06048" strokeWidth="1.4" transform="rotate(18 86 48)" />
          <ellipse cx="92" cy="52" rx="7" ry="20" fill="#d4a054" stroke="#b08840" strokeWidth="1.3" transform="rotate(38 92 52)" />
          <ellipse cx="80" cy="44" rx="7" ry="20" fill="#a06048" stroke="#8a4c38" strokeWidth="1.3" transform="rotate(-6 80 44)" />
          <ellipse cx="94" cy="60" rx="6" ry="16" fill="#c23b2e" stroke="#a83228" strokeWidth="1.2" transform="rotate(55 94 60)" />
        </g>
        <ellipse cx="60" cy="62" rx="20" ry="16" fill="#c4785a" stroke="#a06048" strokeWidth="2" />
        <path d="M50 76c-2 8 4 12 8 4" fill="none" stroke="#d4a054" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M60 78c-1 8 5 11 8 3" fill="none" stroke="#d4a054" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="animal-head">
        <ellipse cx="40" cy="40" rx="10" ry="12" fill="#c4785a" stroke="#a06048" strokeWidth="1.8" />
        <path d="M40 26c2-8 10-6 10 2-4 0-8 2-10-2Z" fill="#c23b2e" stroke="#a83228" strokeWidth="1.1" />
        <path d="M32 46c-10 8-6 16 2 12 2-4 4-8 2-12Z" fill="#c23b2e" stroke="#a83228" strokeWidth="1.1" />
        <path d="M28 42c-8 1-8 7-2 8 4 0 7-2 8-6Z" fill="#e8c58a" stroke="#d4a054" strokeWidth="1.2" />
        <circle cx="42" cy="40" r="2" fill="#3f2a18" />
        <circle cx="42.5" cy="39.4" r="0.5" fill="#f6f1e4" />
        <path d="M36 48c2 2 6 2 8 0" fill="none" stroke="#8a4c38" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
