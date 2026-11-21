import { t } from '../../i18n'
import { AquaEstimate } from '../EnteredBy'
import { useId, useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
  type TooltipContentProps,
} from 'recharts'
import type { WaterBalanceDay } from '../../api'
import { formatInt } from '../../lib/status'
import { formatMm, formatShortWeekday, litresLabel } from './format'

type DayRow = {
  date: string
  weekday: string
  crops_l: number
  animals_l: number
  et0_mm: number
  rain_mm: number
  from_forecast: boolean
}

function isDayRow(v: unknown): v is DayRow {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.date === 'string' && typeof o.weekday === 'string'
}

function NeedTooltip({ active, payload }: TooltipContentProps) {
  if (!active || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!isDayRow(row)) return null
  return (
    <div className="rounded-card border border-line bg-white px-3 py-2 text-xs shadow-shell">
      <p className="font-medium text-ink">{row.weekday}</p>
      <p className="text-ink-soft">{t('plots.crops')}{' '} {litresLabel(row.crops_l)}</p>
      <p className="text-ink-soft">{t('water.animals')}{' '} {litresLabel(row.animals_l)}</p>
      {row.from_forecast ? (
        <>
          <p className="text-ink-soft">ET0 {formatMm(row.et0_mm)}</p>
          <p className="text-ink-soft">{t('weather.rain')}{' '} {formatMm(row.rain_mm)}</p>
        </>
      ) : <p className="text-ink-soft">{t('water.noForecastDay')}</p>}
      <AquaEstimate note={row.from_forecast ? t('water.forecastTooltip') : t('water.typicalTooltip')} />
    </div>
  )
}

export function DailyNeedChart({ days }: { days: WaterBalanceDay[] }) {
  const uid = useId().replace(/:/g, '')
  const cropPattern = `${uid}-crop-est`
  const animalPattern = `${uid}-animal-est`
  const rows = useMemo<DayRow[]>(
    () =>
      days.map((d) => ({
        date: d.date,
        weekday: formatShortWeekday(d.date),
        crops_l: d.crops_l,
        animals_l: d.animals_l,
        et0_mm: d.et0_mm,
        rain_mm: d.rain_mm,
        from_forecast: d.from_forecast,
      })),
    [days],
  )

  if (rows.length === 0) {
    return <p className="text-sm text-ink-soft">{t('water.noDailyBreakdown')}</p>
  }

  return (
    <div>
      <div dir="ltr" className="h-56 w-full min-w-0 sm:h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <pattern
                id={cropPattern}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--color-leaf)" fillOpacity={0.35} />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-white)" strokeWidth="2.5" />
              </pattern>
              <pattern
                id={animalPattern}
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="var(--color-ochre)" fillOpacity={0.35} />
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-white)" strokeWidth="2.5" />
              </pattern>
            </defs>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="weekday"
              tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatInt(Number(v))}
              width={40}
            />
            <Tooltip
              content={NeedTooltip}
              cursor={{ fill: 'var(--color-cream-deep)', fillOpacity: 0.6 }}
            />
            <Bar
              dataKey="crops_l"
              name={t('plots.crops')}
              stackId="need"
              maxBarSize={28}
              radius={[0, 0, 0, 0]}
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell
                  key={`c-${row.date}`}
                  fill={row.from_forecast ? 'var(--color-leaf)' : `url(#${cropPattern})`}
                />
              ))}
            </Bar>
            <Bar
              dataKey="animals_l"
              name={t('water.animals')}
              stackId="need"
              maxBarSize={28}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell
                  key={`a-${row.date}`}
                  fill={row.from_forecast ? 'var(--color-ochre)' : `url(#${animalPattern})`}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-leaf" aria-hidden />
          {t('plots.crops')}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ochre" aria-hidden />
          {t('water.animals')}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm border border-line"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--color-mute), var(--color-mute) 1px, var(--color-white) 1px, var(--color-white) 3px)',
            }}
            aria-hidden
          />
          {t('water.typicalWeather')}
        </li>
      </ul>
      <table className="sr-only">
        <caption>{t('water.weekNeed')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('water.day')}</th>
            <th scope="col">{t('plots.crops')}</th>
            <th scope="col">{t('water.animals')}</th>
            <th scope="col">ET0</th>
            <th scope="col">{t('weather.rain')}</th>
            <th scope="col">{t('market.source')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.date}>
              <th scope="row">{row.weekday}</th>
              <td>{litresLabel(row.crops_l)}</td>
              <td>{litresLabel(row.animals_l)}</td>
              <td>{formatMm(row.et0_mm)}</td>
              <td>{formatMm(row.rain_mm)}</td>
              <td>{row.from_forecast ? t('water.forecastWeather') : t('water.typicalWeather')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
