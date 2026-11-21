import { t } from '../i18n'
import type { Forecast } from '../api'
import { formatWeekday, isGoodWaterDay } from './weather/format'
import { VIEW_HREF } from '../lib/view'
import { AquaEstimate } from './EnteredBy'
import { LiveNumber } from './StatTile'

export function WaterOutlookCard({ forecast }: { forecast: Forecast | null }) {
  const days = forecast?.daily.slice(0, 7) ?? []
  const complete = days.length === 7
  const rain = complete && days.every((d) => Number.isFinite(d.rain_mm))
    ? days.reduce((sum, d) => sum + d.rain_mm, 0) : null
  const loss = complete && days.every((d) => Number.isFinite(d.et0_mm))
    ? days.reduce((sum, d) => sum + d.et0_mm, 0) : null
  const good = complete && days.every((d) => Number.isFinite(d.rain_probability) && Number.isFinite(d.wind_max_kmh))
    ? days.filter(isGoodWaterDay).map((d) => formatWeekday(d.date)) : null

  return (
    <section data-card="" aria-labelledby="dashboard-outlook" className="shrink-0 rounded-card border border-line bg-cream px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <h2 id="dashboard-outlook" className="font-serif text-base leading-tight text-ink">
          <a href={VIEW_HREF.weather} className="hover:underline">{t('water.outlook')}</a>
        </h2>
        {forecast ? <AquaEstimate record={forecast} note={t('estimates.outlook')} /> : null}
      </div>
      <dl className="mt-0.5 flex flex-wrap gap-x-3 text-xs leading-snug text-ink-soft">
        <div><dt className="inline [font-variant:all-small-caps]">{t('weather.weekRain')}{' '} </dt><dd className="inline font-medium text-ink"><LiveNumber value={rain} unit=" mm" /></dd></div>
        <div><dt className="inline [font-variant:all-small-caps]">{t('weather.loss')}{' '} </dt><dd className="inline font-medium text-ink"><LiveNumber value={loss} unit=" mm" /></dd></div>
        <div><dt className="inline [font-variant:all-small-caps]">{t('weather.goodDays')}{' '} </dt><dd className="inline font-medium text-ink">{good == null ? t('common.noReading') : good.join(', ') || t('weather.noneWeek')}</dd></div>
      </dl>
    </section>
  )
}
