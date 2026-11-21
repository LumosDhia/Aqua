import { t } from '../../i18n'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { ApiError, api, type Crop, type MarketGovernorate, type WaterKind } from '../../api'
import type { FarmDoneSummary } from './DoneScreen'
import { draftKey, newFarmDraft, readFarmDraft, saveFarmDraft, type FarmDraft } from './farmDraft'
import {
  HERD_MAX, PLOT_MAX, SOURCE_MAX, WIZARD_STEPS,
  blankPlot, blankSource, farmAreaError, farmNameError, governorateError, herdError,
  parseDecimal, plotAreaError, sourceErrors, toOnboardingHerds, toOnboardingPlots, toOnboardingSources,
  type HerdDraft, type WizardStepId,
} from './model'
import { herdsFromRead, imageAspect, plotsFromRead, readSignature, readSummary } from './readFarm'
import { StepAbout } from './StepAbout'
import { StepAnimals } from './StepAnimals'
import { StepCrops } from './StepCrops'
import { StepFarm } from './StepFarm'
import { StepReview } from './StepReview'
import { StepWater } from './StepWater'

export type WizardCreated = FarmDoneSummary & { farmId: number }

export type FarmerMeta = {
  index: number
  title: string
  helper: string
  last: boolean
  blocked: boolean
  busy: boolean
  canBack: boolean
}

export type FarmerWizardHandle = {
  next: () => void
  back: () => void
}

type FarmerWizardProps = {
  userId: number
  onCreated: (info: WizardCreated) => void
  onMeta: (meta: FarmerMeta) => void
  ref?: Ref<FarmerWizardHandle>
}

export function FarmerWizard({ userId, onCreated, onMeta, ref }: FarmerWizardProps) {
  const [draft, setDraft] = useState(newFarmDraft)
  const [draftReady, setDraftReady] = useState(false)
  const [draftError, setDraftError] = useState(false)
  const [catalog, setCatalog] = useState<{ crops: Crop[]; governorates: MarketGovernorate[] } | null>(null)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [readingSketch, setReadingSketch] = useState(false)
  const [parsing, setParsing] = useState(false)
  const submitting = useRef(false)

  const { step, farmName, governorate, farmArea, plots, sources, herds, aboutMode, description, sketch, read } = draft
  const index = WIZARD_STEPS.findIndex((question) => question.id === step)
  const question = WIZARD_STEPS[index] ?? WIZARD_STEPS[0]
  const last = step === 'review'
  const ready = draftReady && catalog != null
  const blocked = !ready || readingSketch || parsing

  useEffect(() => {
    let active = true
    readFarmDraft(userId)
      .then((saved) => {
        if (active && saved && WIZARD_STEPS.some((item) => item.id === saved.step)) setDraft(saved)
      })
      .catch(() => {
        if (active) setDraftError(true)
      })
      .finally(() => {
        if (active) setDraftReady(true)
      })
    return () => { active = false }
  }, [userId])

  useLayoutEffect(() => {
    if (!draftReady || draftError) return
    let active = true
    void saveFarmDraft(userId, draft).catch(() => {
      if (active) setDraftError(true)
    })
    return () => { active = false }
  }, [draft, draftReady, draftError, userId])

  useEffect(() => {
    let active = true
    Promise.all([api.crops(), api.marketMeta()])
      .then(([crops, meta]) => {
        if (active) setCatalog({ crops, governorates: meta.governorates })
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof ApiError ? err.message : t('onboarding.formError'))
      })
    return () => { active = false }
  }, [retry])

  useLayoutEffect(() => {
    onMeta({ index, title: question.title, helper: question.helper, last, blocked, busy,
      canBack: index > 0 && !blocked && !busy })
  }, [index, question, last, blocked, busy, onMeta])

  function patch(values: Partial<FarmDraft>) {
    setError('')
    setDraft((previous) => ({ ...previous, ...values }))
  }

  function go(next: WizardStepId) {
    setAttempted(false)
    patch({ step: next })
  }

  function invalid(at: WizardStepId): boolean {
    switch (at) {
      case 'farm':
        return Boolean(farmNameError(farmName) || governorateError(governorate, catalog?.governorates ?? []) || farmAreaError(farmArea))
      case 'crops':
        return plots.some((plot) =>
          !catalog?.crops.some((crop) => crop.id === plot.crop) || Boolean(plotAreaError(plot)),
        )
      case 'water':
        return sources.some((source) => Object.values(sourceErrors(source)).some(Boolean))
      case 'animals':
        return herds.some((herd) => Boolean(herdError(herd)))
      default:
        return false
    }
  }

  function farmAreaM2(): number | null {
    return farmArea.trim() && !farmAreaError(farmArea) ? Number((parseDecimal(farmArea) * 10_000).toPrecision(15)) : null
  }

  /** Read the drawing or description once per change; a good reading fills the next steps, a poor one says why and stays. */
  async function readAbout() {
    const area = farmAreaM2()
    const sig = readSignature(sketch, description, area)
    setParsing(true)
    setError('')
    try {
      const result = await api.parseSketch({
        ...(sketch ? { image: sketch.previewUrl } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(area ? { area_m2: area } : {}),
      })
      if (!result.ok) {
        setDraft((previous) => ({ ...previous, read: { sig, ok: false, message: result.reason } }))
        return
      }
      const aspect = sketch ? await imageAspect(sketch.previewUrl) : null
      const fresh = plotsFromRead(result, area, aspect)
      const animals = herdsFromRead(result, aspect)
      setAttempted(false)
      setDraft((previous) => {
        const keptHerds = previous.herds.filter((h) => !h.fromRead)
        return {
          ...previous,
          step: 'crops',
          plots: [...previous.plots.filter((p) => !p.fromRead), ...fresh].slice(0, PLOT_MAX),
          herds: [...keptHerds, ...animals.filter((a) => !keptHerds.some((h) => h.species === a.species))].slice(0, HERD_MAX),
          read: { sig, ok: true, message: readSummary(result, catalog?.crops ?? []) },
        }
      })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : t('onboarding.readError')
      setDraft((previous) => ({ ...previous, read: { sig, ok: false, message } }))
    } finally {
      setParsing(false)
    }
  }

  function advance() {
    if (blocked || submitting.current) return
    if (step === 'about' && (sketch || description.trim()) && read?.sig !== readSignature(sketch, description, farmAreaM2())) {
      void readAbout()
      return
    }
    const next = WIZARD_STEPS[index + 1]
    const missing = next ? (invalid(step) ? question : undefined) : WIZARD_STEPS.find(({ id }) => invalid(id))
    if (missing) {
      if (missing.id !== step) go(missing.id)
      setAttempted(true)
      requestAnimationFrame(() => document.querySelector<HTMLElement>('#onboard-main [aria-invalid="true"]')?.focus())
      return
    }
    if (next) go(next.id)
    else void createFarm()
  }

  useImperativeHandle(ref, () => ({
    next: advance,
    back: () => {
      const previous = WIZARD_STEPS[index - 1]
      if (previous && !blocked && !submitting.current) go(previous.id)
    },
  }))

  async function createFarm() {
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const made = await api.onboardFarmer({
        draft_key: draft.key,
        sketch: sketch?.data,
        farm: {
          name: farmName.trim(),
          governorate,
          area_m2: farmArea.trim() ? Number((parseDecimal(farmArea) * 10_000).toPrecision(15)) : null,
          description: description.trim(),
        },
        plots: toOnboardingPlots(plots),
        water_sources: toOnboardingSources(sources),
        livestock: toOnboardingHerds(herds),
      })
      void saveFarmDraft(userId).catch(() => undefined)
      onCreated({
        farmId: made.farm_id,
        name: made.name,
        governorate: made.governorate,
        farmAreaM2: made.area_m2,
        areaM2: made.planted_area_m2,
        plots: made.plots,
        sources: made.water_sources,
        animals: made.animal_count,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('onboarding.saveError'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  function addField(crop: string) {
    if (plots.length < PLOT_MAX) patch({ plots: [...plots, blankPlot(draftKey(), crop)] })
  }

  function toggleCrop(crop: string) {
    if (plots.some((plot) => plot.crop === crop)) {
      patch({ plots: plots.filter((plot) => plot.crop !== crop) })
    } else {
      addField(crop)
    }
  }

  function addSource(kind: WaterKind) {
    if (sources.length < SOURCE_MAX) patch({ sources: [...sources, blankSource(draftKey(), kind)] })
  }

  function toggleHerd(species: HerdDraft['species']) {
    if (herds.some((herd) => herd.species === species)) {
      patch({ herds: herds.filter((herd) => herd.species !== species) })
    } else if (herds.length < HERD_MAX) {
      patch({ herds: [...herds, { species, count: '', place: '' }] })
    }
  }

  if (loadError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink">
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => { setLoadError(''); setRetry((n) => n + 1) }}
          className="rounded-full bg-forest-deep px-4 py-1.5 text-xs text-white"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }
  if (!ready || !catalog) return <p role="status" className="text-sm text-ink-soft">{t('onboarding.loading')}</p>

  return (
    <div>
      {draftError ? (
        <p role="status" className="mb-3 text-sm text-hanko">{t('onboarding.localDraftError')}</p>
      ) : null}
      {step === 'farm' ? (
        <StepFarm name={farmName} governorate={governorate} governorates={catalog.governorates}
          area={farmArea} attempted={attempted} busy={busy}
          onName={(farmName) => patch({ farmName })} onGovernorate={(governorate) => patch({ governorate })}
          onArea={(farmArea) => patch({ farmArea })} />
      ) : null}
      {step === 'crops' ? (
        <StepCrops note={read?.ok ? read.message : ''} crops={catalog.crops} plots={plots} attempted={attempted} busy={busy}
          onToggleCrop={toggleCrop} onAddField={addField}
          onPatch={(key, values) => patch({ plots: plots.map((plot) => plot.key === key ? { ...plot, ...values } : plot) })}
          onRemove={(key) => patch({ plots: plots.filter((plot) => plot.key !== key) })} />
      ) : null}
      {step === 'water' ? (
        <StepWater sources={sources} attempted={attempted} busy={busy} onAdd={addSource}
          onPatch={(key, values) => patch({ sources: sources.map((source) => source.key === key ? { ...source, ...values } : source) })}
          onRemove={(key) => patch({ sources: sources.filter((source) => source.key !== key) })} />
      ) : null}
      {step === 'animals' ? (
        <StepAnimals herds={herds} attempted={attempted} busy={busy} onToggle={toggleHerd}
          onPatch={(species, values) => patch({ herds: herds.map((herd) => herd.species === species ? { ...herd, ...values } : herd) })} />
      ) : null}
      {step === 'about' ? (
        <StepAbout mode={aboutMode} description={description} sketch={sketch} busy={busy}
          onMode={(aboutMode) => patch({ aboutMode })} onDescription={(description) => patch({ description })}
          onSketch={(sketch) => patch({ sketch })} onReadingSketch={setReadingSketch}
          parsing={parsing}
          readFailure={read && !read.ok && read.sig === readSignature(sketch, description, farmAreaM2()) ? read.message : ''} />
      ) : null}
      {step === 'review' ? (
        <StepReview farmName={farmName} governorate={governorate} farmArea={farmArea}
          plots={plots} sources={sources} herds={herds} description={description} sketch={sketch} crops={catalog.crops} />
      ) : null}
      {error ? <p className="mt-3 text-sm text-hanko" role="alert">{error}</p> : null}
    </div>
  )
}
