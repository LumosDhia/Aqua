import { t } from '../i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CloudSun, Droplets, Sprout } from 'lucide-react'
import { ApiError, api, type Forecast, type ForecastAlert, type ForecastDay } from '../api'
import { alertKindIcon, weatherIcon } from '../lib/weatherIcons'
import { PageFrame } from './PageFrame'
import { HourlyChart } from './weather/HourlyChart'
import {
  calendarToday,
  formatAlertDate,
  formatDayHeading,
  formatKmh,
  formatMm,
  formatPct,
  formatTemp,
  formatUv,
  formatWeekday,
  isGoodWaterDay,
  updatedLine,
} from './weather/format'

type WeatherPanelProps = {
  farmId: number | null
}

type HourSpan = 24 | 48

const LEVEL_LABEL: Record<ForecastAlert['level'], string> = {
  get warning() { return t('weather.warning') },
  get watch() { return t('weather.watch') },
  get info() { return t('weather.info') },
}

const LEVEL_BANNER: Record<ForecastAlert['level'], string> = {
  warning: 'border-hanko/30 bg-hanko/10',
  watch: 'border-ochre/30 bg-ochre/10',
  info: 'border-teal/30 bg-leaf-soft/50',
}

const LEVEL_CHIP: Record<ForecastAlert['level'], string> = {
  warning: 'bg-hanko/15 text-hanko',
  watch: 'bg-ochre/20 text-ink',
  info: 'bg-teal/15 text-forest',
}

const ET0_TIP = 'Reference evapotranspiration, the water that crops use on that day'

function forecastError(e: unknown): string {
  if (e instanceof ApiError && e.status === 502) {
    return t('weather.unavailable')
  }
  return e instanceof ApiError ? e.message : t('weather.loadError')
}

function upcomingHours(hourly: Forecast['hourly'], currentTime: string, count: HourSpan) {
  const i = hourly.findIndex((h) => h.time >= currentTime)
  const start = i === -1 ? Math.max(0, hourly.length - count) : i
  return hourly.slice(start, start + count)
}

export function WeatherPanel({ farmId }: WeatherPanelProps) {
  const [data, setData] = useState<Forecast | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [ready, setReady] = useState(false)
  const [tick, setTick] = useState(0)
  const [span, setSpan] = useState<HourSpan>(24)
  const seqRef = useRef(0)

  useEffect(() => {
    setData(null)
    setLoadErr('')
    setReady(false)
    setSpan(24)
  }, [farmId])

  useEffect(() => {
    let cancelled = false
    seqRef.current += 1
    const my = seqRef.current

    async function load(isPoll: boolean) {
      if (farmId == null) {
        if (!cancelled && my === seqRef.current) {
          setData(null)
          setReady(true)
        }
        return
      }
      try {
        const next = await api.forecast(farmId)
        if (cancelled || my !== seqRef.current) return
        setData(next)
        setLoadErr('')
      } catch (e) {
        if (cancelled || my !== seqRef.current) return
        if (!isPoll) {
          setLoadErr(forecastError(e))
          setData(null)
        }
      } finally {
        if (!cancelled && my === seqRef.current) setReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 600_000)
    return () => {
      cancelled = true
      seqRef.current += 1
      window.clearInterval(timer)
    }
  }, [farmId, tick])

  function onRetry() {
    setLoadErr('')
    setReady(false)
    setTick((n) => n + 1)
  }

  const hours = useMemo(() => {
    if (!data) return []
    return upcomingHours(data.hourly, data.current.time, span)
  }, [data, span])

  const watering = useMemo(() => {
    const days = data?.daily ?? []
    const rain = days.reduce((s, d) => s + d.rain_mm, 0)
    const et0 = days.reduce((s, d) => s + d.et0_mm, 0)
    const good = days.filter(isGoodWaterDay)
    return { rain, et0, good }
  }, [data])

  const hideBody = Boolean(loadErr && !data && ready)
  const emptyFarm = farmId == null && ready
  const place = data
    ? data.farm.region.trim() || data.farm.name
    : ''

  return (
    <PageFrame
      label={t('shell.weather')}
      busy={!ready}
      header={
        <>
          <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1">
              <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
                {t('shell.weather')}
              </h2>
              {ready && data ? (
                <>
                  <p className="truncate text-xs text-ink-soft">
                    {updatedLine(place, data.current.time)}
                  </p>
                  <p className="text-[11px] text-mute">{t('weather.source')}{' '} {data.source}</p>
                </>
              ) : ready ? (
                emptyFarm ? (
                  <p className="text-xs text-ink-soft">{t('weather.farmRequired')}</p>
                ) : null
              ) : (
                <p className="aqua-skel mt-1 h-3 w-56 rounded" aria-hidden />
              )}
            </div>
          </header>
          {loadErr ? (
            <div className="px-4 pt-3 sm:px-6">
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
              >
                <p>{loadErr}</p>
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
                >
                  {t('common.retry')}
                </button>
              </div>
            </div>
          ) : null}
        </>
      }
    >
      {hideBody ? null : !ready ? (
        <WeatherSkeleton />
      ) : emptyFarm ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-soft text-forest"
            aria-hidden
          >
            <CloudSun size={28} />
          </div>
          <p className="mt-4 font-serif text-xl text-ink">{t('farm.none')}</p>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">
            {t('weather.farmRequiredHelp')}
          </p>
        </div>
      ) : data ? (
        <div className="flex h-full min-h-0 flex-col gap-2 lg:gap-3">
          {data.alerts.length > 0 ? <AlertList alerts={data.alerts} /> : null}

          <CurrentCard data={data} />

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-2 xl:gap-3">
            <article className="flex min-h-0 flex-col rounded-card border border-line bg-cream p-3 sm:p-4">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-base text-ink">{t('weather.nextHours')}</h3>
                <div className="flex flex-wrap items-center gap-3">
                  <ul className="flex items-center gap-3 text-[11px] text-ink-soft">
                    <li className="inline-flex items-center gap-1.5">
                      <span className="h-0.5 w-3 rounded-full bg-forest" aria-hidden />
                      {t('dashboard.temperature')}
                    </li>
                    <li className="inline-flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-sm bg-teal/70" aria-hidden />
                      {t('weather.rainChance')}
                    </li>
                  </ul>
                  <div
                    role="group"
                    aria-label={t('weather.range')}
                    className="inline-flex items-center rounded-full border border-line bg-white p-1 text-sm"
                  >
                    <button
                      type="button"
                      aria-pressed={span === 24}
                      onClick={() => setSpan(24)}
                      className={`rounded-full px-3 py-1 ${
                        span === 24 ? 'bg-forest-deep text-white' : 'text-ink-soft'
                      }`}
                    >
                      {t('common.hours24')}
                    </button>
                    <button
                      type="button"
                      aria-pressed={span === 48}
                      onClick={() => setSpan(48)}
                      className={`rounded-full px-3 py-1 ${
                        span === 48 ? 'bg-forest-deep text-white' : 'text-ink-soft'
                      }`}
                    >
                      {t('common.hours48')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="mt-2 min-h-[10rem] flex-1">
                <HourlyChart hours={hours} />
              </div>
            </article>

            <section aria-label={t('weather.week')} className="flex min-h-0 min-w-0 flex-col">
              <h3 className="shrink-0 font-serif text-base text-ink">{t('weather.week')}</h3>
              <ul className="mt-2 grid min-h-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7 xl:grid-cols-1 xl:content-start xl:gap-1 xl:overflow-y-auto xl:pe-1">
                {data.daily.map((day) => (
                  <DayCard
                    key={day.date}
                    day={day}
                    today={day.date === calendarToday(data.timezone)}
                  />
                ))}
              </ul>
            </section>
          </div>

          <section aria-label={t('weather.wateringImpact')} className="shrink-0">
            <h3 className="font-serif text-base text-ink">{t('weather.wateringImpact')}</h3>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <article className="min-w-0 rounded-card border border-line bg-cream px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-ink-soft">{t('weather.weekRain')}</p>
                  <span className="rounded-full bg-leaf-soft/60 p-1 text-forest">
                    <Droplets size={14} strokeWidth={1.75} aria-hidden />
                  </span>
                </div>
                <p className="mt-1 font-serif text-[clamp(1.25rem,2.4vh,1.875rem)] leading-none text-ink">
                  {formatMm(watering.rain)}
                  <span className="ms-1.5 align-middle font-sans text-sm font-medium text-ink-soft">
                    mm
                  </span>
                </p>
              </article>
              <article className="min-w-0 rounded-card border border-line bg-cream px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-ink-soft">{t('weather.weekLoss')}</p>
                  <span className="rounded-full bg-leaf-soft/60 p-1 text-forest">
                    <Sprout size={14} strokeWidth={1.75} aria-hidden />
                  </span>
                </div>
                <p className="mt-1 font-serif text-[clamp(1.25rem,2.4vh,1.875rem)] leading-none text-ink">
                  {formatMm(watering.et0)}
                  <span className="ms-1.5 align-middle font-sans text-sm font-medium text-ink-soft">
                    mm
                  </span>
                </p>
              </article>
              <article className="min-w-0 rounded-card border border-line bg-cream px-3 py-2">
                <p className="text-xs font-medium text-ink-soft">{t('weather.goodDays')}</p>
                {watering.good.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-soft">{t('weather.noneWeek')}</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {watering.good.map((d) => (
                      <li
                        key={d.date}
                        className="rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest"
                      >
                        {formatWeekday(d.date)}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </PageFrame>
  )
}

function AlertList({ alerts }: { alerts: ForecastAlert[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? alerts : alerts.slice(0, 2)
  const extra = alerts.length - 2
  return (
    <div className="shrink-0">
      <ul className="space-y-1">
        {visible.map((a, i) => {
          const Icon = alertKindIcon(a.kind)
          const expanded = open === i
          return (
            <li
              key={`${a.kind}-${a.date}-${a.level}-${i}`}
              role={a.level === 'warning' ? 'alert' : 'status'}
              className={`rounded-card border px-3 py-1.5 ${LEVEL_BANNER[a.level]}`}
            >
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : i)}
                className="flex w-full min-w-0 items-center gap-2 text-start"
              >
                <span className="shrink-0 text-ink" aria-hidden>
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_CHIP[a.level]}`}
                >
                  {LEVEL_LABEL[a.level]}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{a.title}</span>
                <span className="hidden shrink-0 text-xs text-ink-soft sm:inline">
                  {formatAlertDate(a.date)}
                </span>
              </button>
              {expanded ? (
                <p className="mt-1 ps-7 text-sm text-ink">{a.text}</p>
              ) : (
                <p className="sr-only">{a.text}</p>
              )}
            </li>
          )
        })}
      </ul>
      {extra > 0 && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 text-xs font-medium text-forest underline-offset-2 hover:underline"
        >
          +{extra} more
        </button>
      ) : null}
    </div>
  )
}

function CurrentCard({ data }: { data: Forecast }) {
  const Icon = weatherIcon(data.current.icon)
  const c = data.current
  return (
    <article className="shrink-0 rounded-card border border-line bg-cream px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif text-[clamp(1.75rem,4vh,3rem)] leading-none text-ink">
            {formatTemp(c.temperature)}
            <span className="ms-0.5 font-sans text-base text-ink-soft sm:text-lg">°C</span>
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink">
            <Icon size={16} strokeWidth={1.75} aria-hidden className="text-forest" />
            {c.condition}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm text-ink-soft">
          <div>
            <dt className="inline">{t('weather.feelsLike')}{' '} </dt>
            <dd className="inline font-medium text-ink">{formatTemp(c.feels_like)}°C</dd>
          </div>
          <div>
            <dt className="inline">{t('weather.humidity')}{' '} </dt>
            <dd className="inline font-medium text-ink">{formatPct(c.humidity)}</dd>
          </div>
          <div>
            <dt className="inline">{t('weather.wind')}{' '} </dt>
            <dd className="inline font-medium text-ink">{formatKmh(c.wind_kmh)}</dd>
          </div>
          <div>
            <dt className="inline">{t('weather.gusts')}{' '} </dt>
            <dd className="inline font-medium text-ink">{formatKmh(c.gust_kmh)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="inline">{t('weather.rainNow')}{' '} </dt>
            <dd className="inline font-medium text-ink">{formatMm(c.rain_mm)} mm</dd>
          </div>
        </dl>
      </div>
    </article>
  )
}

function DayCard({ day, today }: { day: ForecastDay; today: boolean }) {
  const Icon = weatherIcon(day.icon)
  const heading = formatDayHeading(day.date)
  const rainChance = day.rain_probability
  return (
    <li
      className={`min-w-0 rounded-card border p-2 xl:flex xl:items-center xl:gap-3 xl:py-1.5 ${
        today ? 'border-forest bg-leaf-soft/40' : 'border-line bg-cream'
      }`}
    >
      <p className="flex items-baseline justify-between gap-1 text-sm xl:w-24 xl:shrink-0 xl:flex-col xl:items-start xl:gap-0">
        <span className="truncate font-medium text-ink">{heading.weekday}</span>
        <span className={`shrink-0 text-[11px] ${today ? 'font-medium text-forest' : 'text-ink-soft'}`}>
          {today ? t('dashboard.today') : heading.rest}
        </span>
      </p>
      <p className="mt-1 flex min-w-0 items-center gap-1 text-sm text-ink xl:mt-0 xl:w-28 xl:shrink-0">
        <Icon size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-forest" />
        <span className="min-w-0 truncate">{day.condition}</span>
      </p>
      <p className="mt-1 font-serif text-lg leading-none text-ink xl:mt-0 xl:w-16 xl:shrink-0">
        {formatTemp(day.temp_max)}°
        <span className="ms-1 font-sans text-xs text-ink-soft">{formatTemp(day.temp_min)}°</span>
      </p>
      <dl className="mt-1 space-y-0.5 text-[11px] text-ink-soft xl:mt-0 xl:flex xl:min-w-0 xl:flex-1 xl:flex-wrap xl:gap-x-3 xl:gap-y-0 xl:space-y-0">
        <div>
          <dt className="inline">{t('weather.rain')}{' '} </dt>
          <dd className="inline font-medium text-ink">
            {formatMm(day.rain_mm)} mm
            {rainChance == null ? '' : ` · ${formatPct(rainChance)}`}
          </dd>
        </div>
        <div>
          <dt className="inline">{t('weather.wind')}{' '} </dt>
          <dd className="inline font-medium text-ink">{formatKmh(day.wind_max_kmh)}</dd>
        </div>
        <div>
          <dt className="sr-only">{t('weather.loss')}</dt>
          <dd>
            <span
              tabIndex={0}
              title={ET0_TIP}
              aria-label={t('weather.plantLoss', { millimetres: formatMm(day.et0_mm), advice: ET0_TIP })}
              className="inline-flex items-center gap-1 font-medium text-ink"
            >
              <Sprout size={12} aria-hidden className="text-forest" />
              Plants lose {formatMm(day.et0_mm)} mm
            </span>
          </dd>
        </div>
        <div>
          <dt className="inline">UV </dt>
          <dd className="inline font-medium text-ink">
            {day.uv_index == null ? '—' : formatUv(day.uv_index)}
          </dd>
        </div>
      </dl>
    </li>
  )
}

function WeatherSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" aria-hidden>
      <div className="rounded-card border border-line bg-white p-3">
        <div className="aqua-skel h-8 w-28 rounded" />
        <div className="aqua-skel mt-2 h-4 w-40 rounded" />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-3">
          <div className="aqua-skel h-4 w-28 rounded" />
          <div className="aqua-skel mt-3 h-40 w-full rounded" />
        </div>
        <ul className="grid grid-cols-7 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <li key={i} className="min-w-0 rounded-card border border-line bg-white p-2">
              <div className="aqua-skel h-3 w-10 rounded" />
              <div className="aqua-skel mt-2 h-4 w-full rounded" />
              <div className="aqua-skel mt-2 h-5 w-8 rounded" />
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-card border border-line bg-white px-3 py-2">
            <div className="aqua-skel h-3 w-24 rounded" />
            <div className="aqua-skel mt-2 h-6 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
