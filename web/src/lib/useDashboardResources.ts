import { useCallback, useState } from 'react'
import { api, type Forecast, type OverviewPlot, type PlotReading } from '../api'
import { useDashboardPoll } from './useDashboardPoll'

type WaterData = Awaited<ReturnType<typeof api.waterSources>>
type Resource<T> = { data: T | null; failed: boolean }
const pending = { data: null, failed: false }
const hour = 3_600_000

function hourlyMoisture(readings: PlotReading[][], now: number) {
  const start = now - 24 * hour
  const hours: number[][] = Array.from({ length: 24 }, () => [])
  for (const series of readings) {
    const latest = new Map<number, { time: number; value: number }>()
    for (const reading of series) {
      // ReadingOut may serialize the database's UTC timestamps without a suffix.
      const ts = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(reading.ts) ? reading.ts : `${reading.ts}Z`
      const time = Date.parse(ts)
      const value = reading.soil_moisture
      if (!Number.isFinite(time) || time < start || time > now || value == null || !Number.isFinite(value)) continue
      const index = Math.min(23, Math.floor((time - start) / hour))
      if (time > (latest.get(index)?.time ?? -Infinity)) latest.set(index, { time, value })
    }
    for (const [index, { value }] of latest) hours[index].push(value)
  }
  return hours.map((values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)
}

export function useDashboardResources(farmId: number, plots: OverviewPlot[], revision: number) {
  const [forecast, setForecast] = useState<Resource<Forecast>>(pending)
  const [water, setWater] = useState<Resource<WaterData>>(pending)
  const [history, setHistory] = useState<Resource<(number | null)[]> & { plotKey: string } | null>(null)
  const plotKey = plots.filter((plot) => plot.last_ts != null).map((plot) => plot.id).sort((a, b) => a - b).join(',')
  const loadContext = useCallback(async (signal: AbortSignal) => {
    await Promise.all([
      api.forecast(farmId, signal).then(
        (data) => { if (!signal.aborted) setForecast({ data, failed: false }) },
        () => { if (!signal.aborted) setForecast((last) => ({ ...last, failed: true })) },
      ),
      api.waterSources(farmId, signal).then(
        (data) => { if (!signal.aborted) setWater({ data, failed: false }) },
        () => { if (!signal.aborted) setWater((last) => ({ ...last, failed: true })) },
      ),
    ])
  }, [farmId])
  const loadHistory = useCallback(async (signal: AbortSignal) => {
    if (!plotKey) return
    const results = await Promise.allSettled(plotKey.split(',').map((id) => api.plotReadings(Number(id), signal)))
    if (signal.aborted) return
    const series = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])
    setHistory((last) => ({
      data: series.length ? hourlyMoisture(series, Date.now()) : last?.plotKey === plotKey ? last.data : null,
      failed: series.length < results.length,
      plotKey,
    }))
  }, [plotKey])

  useDashboardPoll(loadContext, 30_000, revision)
  useDashboardPoll(loadHistory, 30_000, revision)
  return {
    forecast,
    water,
    history: history?.plotKey === plotKey ? history : pending,
  }
}
