import { t } from '../../i18n'
import { useId } from 'react'
import type { MarketGovernorate } from '../../api'
import { FieldError } from './FieldError'
import { farmAreaError, farmNameError, governorateError, NAME_MAX } from './model'

export function StepFarm({
  name, governorate, area, governorates, attempted, busy, onName, onGovernorate, onArea,
}: {
  name: string
  governorate: string
  area: string
  governorates: MarketGovernorate[]
  attempted: boolean
  busy: boolean
  onName: (value: string) => void
  onGovernorate: (value: string) => void
  onArea: (value: string) => void
}) {
  const nameId = useId()
  const govId = useId()
  const areaId = useId()
  const nameError = attempted ? farmNameError(name) : ''
  const locationError = attempted ? governorateError(governorate, governorates) : ''
  const areaError = attempted ? farmAreaError(area) : ''

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={nameId} className="text-xs font-medium text-ink-soft">{t('farm.name')}</label>
        <input id={nameId} value={name} onChange={(e) => onName(e.target.value)}
          maxLength={NAME_MAX} autoComplete="organization" required disabled={busy}
          aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${nameId}-error` : undefined}
          className="journey-field mt-1" />
        <FieldError id={`${nameId}-error`} message={nameError} />
      </div>
      <div>
        <label htmlFor={govId} className="text-xs font-medium text-ink-soft">{t('common.governorate')}</label>
        <select id={govId} value={governorate} onChange={(e) => onGovernorate(e.target.value)}
          required disabled={busy} aria-invalid={Boolean(locationError)}
          aria-describedby={locationError ? `${govId}-error` : undefined} className="journey-field mt-1">
          <option value="">{t('common.chooseGovernorate')}</option>
          {governorates.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
        </select>
        <FieldError id={`${govId}-error`} message={locationError} />
      </div>
      <div>
        <label htmlFor={areaId} className="text-xs font-medium text-ink-soft">{t('farm.areaOptional')}</label>
        <input id={areaId} value={area} onChange={(e) => onArea(e.target.value)}
          inputMode="decimal" disabled={busy} aria-invalid={Boolean(areaError)}
          aria-describedby={areaError ? `${areaId}-error` : undefined} className="journey-field mt-1" />
        <FieldError id={`${areaId}-error`} message={areaError} />
      </div>
    </div>
  )
}
