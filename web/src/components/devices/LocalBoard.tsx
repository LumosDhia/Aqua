import { t } from '../../i18n'
import { formatInt } from '../../lib/status'
import type { Device, DeviceBoardData } from '../../api'
import { BoardModeSwitch, BoardStatus } from './BoardControls'
import { sinceWaterLine, staleValuesNote } from './format'

const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })

export function LocalBoard({
  farmId,
  device,
  canControl,
  onDevice,
  onSettled,
}: {
  farmId: number
  device: Device
  canControl: boolean
  onDevice: (next: Device) => void
  onSettled: () => void
}) {
  const data = device.data
  const alarm = data?.alarm ?? device.alarm
  const status = data?.status ?? (device.status_text || t('devices.waiting'))
  const stale = !device.online
  const lowTank = data != null && data.tank < data.tankMin
  const drySoil = data != null && data.soil < data.soilNeed
  const since = data?.pump
    ? data.pumpLeft != null && data.pumpLeft > 0 ? t('devices.secondsLeft', { seconds: formatInt(data.pumpLeft) }) : undefined
    : data != null ? sinceWaterLine(data.sinceWater) : undefined

  return (
    <div className="mt-3 min-w-0">
      <BoardStatus status={status} alarm={alarm} />

      {stale ? (
        <p className="mt-1.5 text-[11px] text-ink-soft">{staleValuesNote(device.last_seen)}</p>
      ) : null}

      <div
        className={`mt-2 grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3 ${stale ? 'opacity-60' : ''}`}
        aria-label={t('devices.readings')}
      >
        <PercentTile
          label={t('dashboard.tankLevel')}
          value={data?.tank}
          hideValue={data?.tankFault}
          threshold={data?.tankMin}
          thresholdLabel="Tank minimum"
          detail={data?.tankFault ? t('devices.sensorError') : lowTank ? t('devices.pumpBlocked') : undefined}
          warning={!!data?.tankFault || lowTank}
          barClass={lowTank ? 'bg-hanko' : 'bg-ochre'}
        />
        <PercentTile
          label={t('dashboard.moisture')}
          value={data?.soil}
          hideValue={data?.soilFault}
          threshold={data?.soilNeed}
          thresholdLabel="Watering threshold"
          detail={data?.soilRaw != null ? `raw ${formatInt(data.soilRaw)}${data.soilFault ? t('devices.sensorFaultSuffix') : ''}` : data?.soilFault ? t('devices.sensorFault') : undefined}
          warning={!!data?.soilFault}
          barClass={drySoil ? 'bg-ochre' : 'bg-leaf'}
        />
        <ReadingTile
          label={t('devices.rainSensor')}
          value={data == null ? t('common.noReading') : data.rain ? t('devices.raining') : t('devices.dry')}
          detail={data ? `raw ${formatInt(data.rainRaw)}` : undefined}
        />
        <ReadingTile label={t('devices.pump')} value={data == null ? t('common.noReading') : data.pump ? t('devices.onUpper') : t('devices.offUpper')} detail={since} />
        <ReadingTile label={t('devices.airTemperature')} value={data?.temp == null ? t('common.noReading') : `${decimal.format(data.temp)} °C`} />
        <ReadingTile label={t('devices.airHumidity')} value={data?.hum == null ? t('common.noReading') : `${formatInt(data.hum)} %`} />
      </div>

      {data != null && (
        <>
          <p className="mt-1.5 text-[11px] text-ink-soft">{t('devices.uptime')}{' '} {formatInt(Math.floor(data.uptime / 60))} min</p>
          <BoardLimits data={data} />
        </>
      )}

      <div className="mt-2 min-w-0">
        <BoardModeSwitch
          farmId={farmId}
          device={device}
          canControl={canControl}
          onDevice={onDevice}
          onSettled={onSettled}
        />
      </div>
    </div>
  )
}

function PercentTile({
  label,
  value,
  hideValue,
  threshold,
  thresholdLabel,
  detail,
  warning,
  barClass,
}: {
  label: string
  value?: number
  hideValue?: boolean
  threshold?: number
  thresholdLabel: string
  detail?: string
  warning: boolean
  barClass: string
}) {
  const shown = value == null || hideValue ? t('common.noReading') : `${formatInt(value)}%`
  const marker = threshold == null ? undefined : `${thresholdLabel} ${formatInt(threshold)}%`

  return (
    <div className="min-w-0 rounded-xl border border-line bg-cream px-2 py-1.5">
      <p className="text-[11px] leading-tight text-ink-soft">{label}</p>
      <p className="mt-0.5 text-sm font-medium leading-tight text-ink">{shown}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hideValue ? undefined : value}
        aria-valuetext={[shown, marker].filter(Boolean).join(', ')}
        className="relative my-1.5 h-1.5 rounded-full bg-cream-deep"
        title={marker}
      >
        {value != null && !hideValue ? (
          <div className={`h-full rounded-full ${barClass}`} style={{ width: `${value}%` }} />
        ) : null}
        {threshold != null && (
          <span className="absolute -top-0.5 h-2.5 w-0.5 -translate-x-1/2 rounded bg-ink/60" style={{ left: `${threshold}%` }} />
        )}
      </div>
      {detail && <p className={`break-words text-[11px] ${warning ? 'font-medium text-hanko' : 'text-ink-soft'}`}>{detail}</p>}
    </div>
  )
}

function ReadingTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-cream px-2 py-1.5">
      <p className="text-[11px] leading-tight text-ink-soft">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium leading-tight text-ink">{value}</p>
      {detail && <p className="mt-0.5 text-[11px] text-ink-soft">{detail}</p>}
    </div>
  )
}

function BoardLimits({ data }: { data: DeviceBoardData }) {
  const fields = [
    [t('devices.timedMax'), data.manualMaxSec, ' s'], [t('devices.untilStopMax'), data.hardCapSec, ' s'],
    [t('devices.tankMin'), data.tankMin, '%'], [t('devices.soilThreshold'), data.soilNeed, '%'],
    [t('devices.emergencyThreshold'), data.soilEmergency, '%'], [t('devices.normalDose'), data.pumpMs, ' ms'],
    [t('devices.emergencyDose'), data.emergencyMs, ' ms'], [t('devices.soakWait'), data.soakWait, ' ms'],
    [t('devices.hotThreshold'), data.hotC, ' °C'], [t('devices.humidityThreshold'), data.humidSkip, '%'],
    [t('devices.accessPoint'), data.apSsid, ''], [t('devices.firmwareVersion'), data.version, ''],
  ] as const

  return (
    <details className="mt-1.5 text-[11px] text-ink-soft">
      <summary className="cursor-pointer font-medium">{t('devices.settings')}</summary>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-2">
        {fields.filter(([, value]) => value != null).map(([label, value, unit]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="break-all text-end text-ink">{value}{unit}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
