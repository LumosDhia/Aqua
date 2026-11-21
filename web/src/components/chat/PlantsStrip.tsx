import { t } from '../../i18n'
import { useId, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { OverviewPlot } from '../../api'
import { CropArt } from '../art/crops'
import { formatHa, formatInt, STATUS_COLOR, STATUS_LABEL } from '../../lib/status'

const STORAGE_KEY = 'aqua_chat_plants_open'

type PlantsStripProps = {
  plots: OverviewPlot[]
  loading: boolean
  onInsert: (text: string) => void
}

function readOpen(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* quota / private mode */
  }
  try {
    // Tailwind `sm` is 40rem. Collapse on short laptop windows so the composer stays in view.
    const wide = window.matchMedia('(min-width: 40rem)').matches
    const tall = window.matchMedia('(min-height: 760px)').matches
    return wide && tall
  } catch {
    return true
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, open ? '1' : '0')
  } catch {
    /* quota / private mode */
  }
}

function formatArea(areaM2: number): string {
  if (areaM2 >= 1000) return `${formatHa(areaM2)} ha`
  return `${formatInt(areaM2)} m²`
}

function countLine(plots: OverviewPlot[]): string {
  const n = plots.length
  const crops = new Set(plots.map((p) => p.crop)).size
  const plotWord = n === 1 ? 'plot' : 'plots'
  const cropWord = crops === 1 ? 'crop' : 'crops'
  return `${formatInt(n)} ${plotWord}, ${formatInt(crops)} ${cropWord}`
}

function MoistureBar({
  value,
  target,
}: {
  value: number | null
  target: number | null
}) {
  if (value == null) {
    return <p className="mt-2 text-[11px] text-ink-soft">{t('common.noReading')}</p>
  }
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-cream-deep">
        <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
        {target != null ? (
          <span
            className="absolute top-0 h-full w-0.5 bg-ink"
            style={{ left: `${Math.min(100, Math.max(0, target))}%` }}
            title={t('dashboard.targetMoisture', { percent: Math.round(target) })}
          />
        ) : null}
      </div>
      <span className="shrink-0 text-[11px] text-ink-soft">{Math.round(value)}%</span>
    </div>
  )
}

function PlantCard({
  plot,
  onInsert,
}: {
  plot: OverviewPlot
  onInsert: (text: string) => void
}) {
  return (
    <li className="w-40 shrink-0 snap-start [@media(min-height:760px)]:w-48">
      <button
        type="button"
        aria-label={t('chat.plantQuestion', { crop: plot.name, plot: plot.crop_label })}
        onClick={() => onInsert(t('chat.plantPrompt', { crop: plot.name, plot: plot.crop_label }))}
        onFocus={(e) => {
          e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' })
        }}
        className="flex h-full w-full flex-col rounded-card border border-line bg-cream p-2 text-start hover:bg-cream-deep [@media(min-height:760px)]:p-3"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-soft/60 [@media(min-height:760px)]:h-12 [@media(min-height:760px)]:w-12">
          <CropArt crop={plot.crop} size={40} animate />
        </span>
        <p className="mt-1.5 truncate font-serif text-sm leading-tight text-ink [@media(min-height:760px)]:mt-2 [@media(min-height:760px)]:text-base">
          {plot.crop_label}
        </p>
        <p className="truncate text-xs text-ink-soft">{plot.name}</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">{formatArea(plot.area_m2)}</p>
        <MoistureBar value={plot.soil_moisture} target={plot.target} />
        <span
          className="mt-2 w-fit rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ background: STATUS_COLOR[plot.status] }}
        >
          {STATUS_LABEL[plot.status]}
        </span>
      </button>
    </li>
  )
}

export function PlantsStrip({ plots, loading, onInsert }: PlantsStripProps) {
  const headingId = useId()
  const bodyId = useId()
  const [open, setOpen] = useState(readOpen)

  function toggle() {
    setOpen((prev) => {
      const next = !prev
      writeOpen(next)
      return next
    })
  }

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={loading}
      className="min-w-0 shrink-0 border-b border-line px-4 py-2.5 sm:px-6"
    >
      <div className="mx-auto w-full min-w-0 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3
            id={headingId}
            className="min-w-0 font-serif text-base leading-tight text-ink sm:text-lg"
          >
            {t('chat.plants')}
            {!loading ? (
              <span className="ms-2 font-sans text-xs font-normal text-ink-soft">
                {countLine(plots)}
              </span>
            ) : null}
          </h3>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs text-ink-soft hover:bg-cream"
          >
            {open ? (
              <ChevronUp size={14} aria-hidden />
            ) : (
              <ChevronDown size={14} aria-hidden />
            )}
            {open ? t('chat.hidePlants') : t('chat.showPlants')}
          </button>
        </div>

        <div id={bodyId} hidden={!open} className="mt-2.5 min-w-0">
          {loading ? (
            <div className="flex gap-3 overflow-hidden" aria-hidden>
              <div className="aqua-skel h-28 w-40 shrink-0 rounded-card [@media(min-height:760px)]:h-36 [@media(min-height:760px)]:w-48" />
              <div className="aqua-skel h-28 w-40 shrink-0 rounded-card [@media(min-height:760px)]:h-36 [@media(min-height:760px)]:w-48" />
              <div className="aqua-skel h-28 w-40 shrink-0 rounded-card [@media(min-height:760px)]:h-36 [@media(min-height:760px)]:w-48" />
            </div>
          ) : plots.length === 0 ? (
            <p className="text-sm text-ink-soft">
              {t('chat.noPlants')}{' '}
              <a href="#/" className="font-medium text-forest underline underline-offset-2">
                {t('chat.dashboardLink')}
              </a>
            </p>
          ) : (
            <ul className="flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {plots.map((plot) => (
                <PlantCard key={plot.id} plot={plot} onInsert={onInsert} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
