type LogoProps = {
  className?: string
  size?: number
  title?: string
}

export function Logo({ className = '', size = 48, title }: LogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <circle cx="24" cy="24" r="24" fill="currentColor" />
      <path
        d="M24 9.5C24 9.5 13.5 22 13.5 29.2a10.5 10.5 0 0 0 21 0C34.5 22 24 9.5 24 9.5z"
        fill="#F4F7F1"
      />
      <path d="M27.5 21c7.2-3.2 10.4 4.6 4.6 9.2-1.8-3.6-2.8-6.8-4.6-9.2z" fill="#7CB069" />
    </svg>
  )
}

type HankoProps = {
  className?: string
  size?: number
}

export function Hanko({ className = '', size = 40 }: HankoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-hanko font-serif leading-none text-white ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-hidden
    >
      水
    </span>
  )
}
