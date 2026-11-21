import { t } from '../../i18n'
import { useEffect, useRef, useState } from 'react'
import { formatHa, formatInt } from '../../lib/status'
import { prefersReducedMotion } from './journey'

export type FarmDoneSummary = {
  name: string
  governorate: string
  plots: number
  areaM2: number
  farmAreaM2: number | null
  sources: number
  animals: number
}

export type CvDoneSummary = {
  jobs: number
  skills: number
  languages: number
}

type DoneScreenProps = {
  kind: 'farmer' | 'worker'
  farm?: FarmDoneSummary
  cv?: CvDoneSummary
  onOpen: () => void
  onStay: () => void
  staying: boolean
}

const AUTO_MS = 8000

export function DoneScreen({ kind, farm, cv, onOpen, onStay, staying }: DoneScreenProps) {
  const [remain, setRemain] = useState(1)
  const opened = useRef(false)
  const openRef = useRef(onOpen)
  useEffect(() => { openRef.current = onOpen }, [onOpen])

  useEffect(() => {
    if (staying) return
    const start = Date.now()
    let raf = 0
    function tick() {
      const p = 1 - (Date.now() - start) / AUTO_MS
      if (p <= 0) {
        setRemain(0)
        if (!opened.current) {
          opened.current = true
          openRef.current()
        }
        return
      }
      setRemain(p)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [staying])

  const farmLine =
    kind === 'farmer' && farm
      ? t('onboarding.ready', { farmName: farm.name })
      : t('onboarding.cvReady')

  return (
    <div className="flex min-h-full flex-col items-start justify-center py-4">
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
        <span
          aria-hidden
          className="journey-ring absolute inset-0 rounded-full border-2 border-leaf"
        />
        <span
          aria-hidden
          className="journey-ring journey-ring-delay absolute inset-0 rounded-full border-2 border-leaf"
        />
        <svg
          viewBox="0 0 72 72"
          width={72}
          height={72}
          className="relative text-forest"
          aria-hidden
        >
          <circle
            className="journey-draw-circle"
            cx="36"
            cy="36"
            r="30"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            className="journey-draw-tick"
            d="M22 38 l9 9 19-20"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-2 text-lg text-ink">{farmLine}</p>
      <ul className="mt-5 flex flex-wrap gap-2">
        {kind === 'farmer' && farm ? <FarmChips summary={farm} /> : null}
        {kind === 'worker' && cv ? <CvChips summary={cv} /> : null}
      </ul>
      {!staying ? (
        <div className="mt-8 w-full max-w-sm">
          <div
            aria-hidden
            className="h-0.5 overflow-hidden rounded-full bg-leaf-soft/70"
          >
            <div
              className="h-full rounded-full bg-leaf"
              style={{ width: `${Math.max(0, remain) * 100}%` }}
            />
          </div>
          <p className="mt-2">
            <button
              type="button"
              onClick={onStay}
              className="text-sm text-ink-soft hover:text-forest hover:underline"
            >
              {t('onboarding.stay')}
            </button>
          </p>
        </div>
      ) : null}
    </div>
  )
}

function FarmChips({ summary }: { summary: FarmDoneSummary }) {
  const area =
    summary.areaM2 > 10_000
      ? `${formatHa(summary.areaM2)} ha`
      : `${formatInt(summary.areaM2)} m²`
  const plotLabel = `${formatInt(summary.plots)} ${summary.plots === 1 ? 'plot' : 'plots'}, ${area} planted`
  return (
    <>
      {summary.governorate ? <Chip value={summary.governorate} /> : null}
      {summary.farmAreaM2 != null ? <Chip value={`${formatHa(summary.farmAreaM2, 4)} ha total farm area`} /> : null}
      {summary.plots > 0 ? <Chip value={plotLabel} count={summary.plots} /> : null}
      {summary.sources > 0 ? (
        <Chip
          value={`${formatInt(summary.sources)} ${summary.sources === 1 ? 'water source' : 'water sources'}`}
          count={summary.sources}
        />
      ) : null}
      {summary.animals > 0 ? (
        <Chip
          value={`${formatInt(summary.animals)} ${summary.animals === 1 ? 'animal' : 'animals'}`}
          count={summary.animals}
        />
      ) : null}
    </>
  )
}

function CvChips({ summary }: { summary: CvDoneSummary }) {
  return (
    <>
      {summary.jobs > 0 ? (
        <Chip
          value={`${formatInt(summary.jobs)} ${summary.jobs === 1 ? 'job' : 'jobs'}`}
          count={summary.jobs}
        />
      ) : null}
      {summary.skills > 0 ? (
        <Chip
          value={`${formatInt(summary.skills)} ${summary.skills === 1 ? 'skill' : 'skills'}`}
          count={summary.skills}
        />
      ) : null}
      {summary.languages > 0 ? (
        <Chip
          value={`${formatInt(summary.languages)} ${summary.languages === 1 ? 'language' : 'languages'}`}
          count={summary.languages}
        />
      ) : null}
    </>
  )
}

function Chip({ value, count }: { value: string; count?: number }) {
  const shown = useCountUp(count ?? null)
  const label =
    count != null && shown != null ? value.replace(formatInt(count), formatInt(shown)) : value
  return (
    <li className="rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink">
      {label}
    </li>
  )
}

function useCountUp(target: number | null): number | null {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (target == null) return
    if (target === 0 || prefersReducedMotion()) {
      setN(target)
      return
    }
    const start = performance.now()
    const dur = 800
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      setN(Math.round(target * t))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return target == null ? null : n
}
