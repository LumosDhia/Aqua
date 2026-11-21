import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api'
import { FarmNotice } from './FarmNotice'

type PageFrameProps = {
  label: string
  header: ReactNode
  children: ReactNode
  busy?: boolean
  farmId?: number | null
  demonstration?: boolean
  className?: string
  body?: 'scroll' | 'contain'
}

export function PageFrame({
  label,
  header,
  children,
  busy,
  farmId,
  demonstration,
  className,
  body = 'scroll',
}: PageFrameProps) {
  const scroll = body === 'scroll'
  const [demonstrationFarmId, setDemonstrationFarmId] = useState<number | null>(null)

  useEffect(() => {
    if (farmId == null) return
    let active = true
    void api.farm(farmId).then((farm) => {
      if (active) setDemonstrationFarmId(farm.demo ? farm.id : null)
    }).catch(() => {
      if (active) setDemonstrationFarmId(null)
    })
    return () => { active = false }
  }, [farmId])
  return (
    <section
      aria-label={label}
      className={`flex min-h-0 min-w-0 flex-1 flex-col bg-white ${className ?? ''}`}
    >
      {demonstration || (farmId != null && demonstrationFarmId === farmId) ? <FarmNotice /> : null}
      <div className="shrink-0">{header}</div>
      <div
        className={
          scroll
            ? 'page-scroll min-h-0 flex-1 px-4 py-3 sm:px-6'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-6'
        }
        aria-busy={busy}
      >
        {children}
      </div>
    </section>
  )
}
