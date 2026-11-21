import { useEffect, useState } from 'react'
import { initials } from '../lib/status'

type PortraitProps = {
  name: string
  photo?: string | null
  size?: 'sm' | 'md'
}

const SIZE = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-11 w-11 text-sm',
} as const

export function Portrait({ name, photo, size = 'sm' }: PortraitProps) {
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    setBroken(false)
  }, [photo])
  const box = SIZE[size]
  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt=""
        className={`${box} shrink-0 rounded-full object-cover`}
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-forest font-medium text-white`}
      aria-hidden
    >
      {initials(name)}
    </span>
  )
}
