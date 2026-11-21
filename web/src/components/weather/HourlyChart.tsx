import { t } from '../../i18n'
import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { ForecastHour } from '../../api'
import { formatHourLabel, formatPct, formatTemp } from './format'

type HourRow = {
  time: string
  hour: string
  temperature: number
  rain: number | null
  rainBar: number
}

function isHourRow(v: unknown): v is HourRow {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.hour === 'string' && typeof o.temperature === 'number'
}

function HourTooltip({ active, payload }: TooltipContentProps) {
  if (!active || payload.length === 0) return null
  const row = payload[0]?.payload
  if (!isHourRow(row)) return null
  return (
    <div className="rounded-card border border-line bg-white px-3 py-2 text-xs shadow-shell">
      <p className="font-medium text-ink">{row.hour}</p>
      <p className="text-ink-soft">{t('dashboard.temperature')}{' '} {formatTemp(row.temperature)}°C</p>
      <p className="text-ink-soft">
        {t('weather.rainChance')}{' '} {row.rain == null ? '—' : formatPct(row.rain)}
      </p>
    </div>
  )
}

export function HourlyChart({
  hours,
  className,
}: {
  hours: ForecastHour[]
  className?: string
}) {
  const rows = useMemo<HourRow[]>(
    () =>
      hours.map((h) => ({
        time: h.time,
        hour: formatHourLabel(h.time),
        temperature: h.temperature,
        rain: h.rain_probability,
        rainBar: h.rain_probability ?? 0,
      })),
    [hours],
  )

  if (rows.length === 0) {
    return <p className="text-sm text-ink-soft">{t('weather.noHourly')}</p>
  }

  return (
    <div className={`flex h-full min-h-[10rem] min-w-0 flex-col ${className ?? ''}`}>
      <div dir="ltr" className="min-h-[10rem] w-full min-w-0 flex-1" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-line)' }}
              minTickGap={22}
            />
            <YAxis
              yAxisId="temp"
              tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${formatTemp(Number(v))}°`}
              width={40}
            />
            <YAxis
              yAxisId="rain"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: 'var(--color-ink-soft)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${formatTemp(Number(v))}%`}
              width={36}
            />
            <Tooltip
              content={HourTooltip}
              cursor={{ stroke: 'var(--color-line)', strokeWidth: 1 }}
            />
            <Bar
              yAxisId="rain"
              dataKey="rainBar"
              name={t('weather.rainChance')}
              fill="var(--color-teal)"
              fillOpacity={0.45}
              maxBarSize={16}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              yAxisId="temp"
              dataKey="temperature"
              name={t('dashboard.temperature')}
              type="monotone"
              stroke="var(--color-forest)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: 'var(--color-forest)' }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{t('weather.hourlyCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('weather.hour')}</th>
            <th scope="col">{t('dashboard.temperature')}</th>
            <th scope="col">{t('weather.rainChance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.time}>
              <th scope="row">{row.hour}</th>
              <td>{formatTemp(row.temperature)}°C</td>
              <td>{row.rain == null ? '—' : formatPct(row.rain)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
