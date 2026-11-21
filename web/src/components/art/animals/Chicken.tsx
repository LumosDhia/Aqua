import { AnimalSvg, type AnimalArtProps } from './AnimalSvg'

export function Chicken(props: AnimalArtProps) {
  return (
    <AnimalSvg species="chicken" {...props}>
      <ellipse className="animal-shadow" cx="60" cy="90" rx="24" ry="5" fill="#d9d0b8" opacity="0.45" />
      <g className="animal-body">
        <ellipse cx="64" cy="62" rx="22" ry="18" fill="#f6f1e4" stroke="#d9d0b8" strokeWidth="2" />
        <ellipse cx="78" cy="64" rx="10" ry="12" fill="#ebe4d2" stroke="#d9d0b8" strokeWidth="1.4" />
        <path d="M52 78c-2 8 4 12 8 4" fill="none" stroke="#d4a054" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M62 80c-1 8 5 11 8 3" fill="none" stroke="#d4a054" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="animal-head">
        <circle cx="46" cy="42" r="14" fill="#f6f1e4" stroke="#d9d0b8" strokeWidth="2" />
        <path
          d="M40 30c0-8 4-12 8-8 2-6 8-6 10 0 4-2 8 4 4 8Z"
          fill="#c23b2e"
          stroke="#a83228"
          strokeWidth="1.2"
        />
        <path d="M32 46c-8 2-8 8-2 10 4-2 8-4 8-8Z" fill="#c23b2e" stroke="#a83228" strokeWidth="1.1" />
        <path d="M30 44c-10 2-8 8-2 8 4 0 8-2 8-6Z" fill="#e8c58a" stroke="#d4a054" strokeWidth="1.2" />
        <circle cx="48" cy="42" r="2.2" fill="#3f5f50" />
        <circle cx="48.6" cy="41.4" r="0.55" fill="#f6f1e4" />
        <path d="M42 50c2 2 6 2 8 0" fill="none" stroke="#d4c4a0" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </AnimalSvg>
  )
}
