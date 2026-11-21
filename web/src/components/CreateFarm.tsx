import { t } from '../i18n'
import { useState, type FormEvent } from 'react'
import { ApiError, api, type Farm } from '../api'

const REGIONS = [
  { name: 'Tunis', lat: 36.8, lon: 10.18 },
  { name: 'Ariana', lat: 36.86, lon: 10.19 },
  { name: 'Nabeul', lat: 36.45, lon: 10.73 },
  { name: 'Bizerte', lat: 37.27, lon: 9.87 },
  { name: 'Beja', lat: 36.73, lon: 9.18 },
  { name: 'Jendouba', lat: 36.5, lon: 8.78 },
  { name: 'Kairouan', lat: 35.68, lon: 10.1 },
  { name: 'Sousse', lat: 35.83, lon: 10.63 },
  { name: 'Sfax', lat: 34.74, lon: 10.76 },
  { name: 'Gabes', lat: 33.88, lon: 10.1 },
  { name: 'Medenine', lat: 33.35, lon: 10.5 },
  { name: 'Tozeur', lat: 33.92, lon: 8.13 },
] as const

type CreateFarmProps = {
  onCreated: (farm: Farm) => void
}

export function CreateFarm({ onCreated }: CreateFarmProps) {
  const [name, setName] = useState('')
  const [region, setRegion] = useState<string>(REGIONS[0].name)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setErr(t('farm.nameRequired'))
      return
    }
    const loc = REGIONS.find((r) => r.name === region) ?? REGIONS[0]
    setBusy(true)
    setErr('')
    try {
      const farm = await api.createFarm({
        name: trimmed,
        region: loc.name,
        lat: loc.lat,
        lon: loc.lon,
      })
      onCreated(farm)
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('farm.createError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-md rounded-card border border-line bg-cream p-6">
      <h2 className="font-serif text-2xl text-ink">{t('farm.createTitle')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {t('farm.createHelp')}
      </p>
      <form className="mt-5 space-y-4" onSubmit={submit}>
        <div>
          <label htmlFor="farm-name" className="text-xs font-medium text-ink-soft">
            {t('farm.name')}
          </label>
          <input
            id="farm-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
            disabled={busy}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          />
        </div>
        <div>
          <label htmlFor="farm-region" className="text-xs font-medium text-ink-soft">
            {t('farm.region')}
          </label>
          <select
            id="farm-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={busy}
            className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            {REGIONS.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {err ? (
          <p className="text-sm text-hanko" role="alert">
            {err}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-forest-deep px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? t('common.creating') : t('farm.create')}
        </button>
      </form>
    </section>
  )
}
