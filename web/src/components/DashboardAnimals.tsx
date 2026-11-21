import { t } from '../i18n'
import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { ApiError, api, canManageWater, type FarmAnimals, type FarmAnimalPlace, type LivestockSpecies } from '../api'
import { formatInt } from '../lib/status'
import { AnimalArt } from './art/animals'
import { EmptyState } from './EmptyState'
import { AquaEstimate, EnteredBy } from './EnteredBy'
import { AddHerdDialog, type EditableHerd } from './water/AddHerdDialog'
import { litresLabel } from './water/format'

export function DashboardAnimals({ farmId, role, onMutated }: { farmId: number; role: string; onMutated: () => void }) {
  const [data, setData] = useState<FarmAnimals | null>(null)
  const [species, setSpecies] = useState<LivestockSpecies[]>([])
  const [revision, revise] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [editor, setEditor] = useState<'add' | EditableHerd | null>(null)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [removing, setRemoving] = useState(false)
  const [opening, setOpening] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  const canManage = canManageWater(role)

  useEffect(() => {
    let active = true
    void api.farmAnimals(farmId).then(
      (next) => { if (active) { setData(next); setLoadError('') } },
      (e: unknown) => { if (active) setLoadError(e instanceof ApiError ? e.message : t('water.animalsLoadError')) },
    )
    return () => { active = false }
  }, [farmId, revision])

  useEffect(() => {
    if (confirm != null) confirmButton.current?.focus()
  }, [confirm])

  async function addAnimals() {
    if (!canManage || opening || removing) return
    setActionError('')
    setConfirm(null)
    if (species.length) {
      setEditor('add')
      return
    }
    setOpening(true)
    try {
      const catalog = (await api.livestock(farmId)).species
      if (!catalog.length) {
        setActionError(t('dashboard.animalTypesTry'))
        return
      }
      setSpecies(catalog)
      setEditor('add')
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : t('dashboard.animalTypesError'))
    } finally {
      setOpening(false)
    }
  }

  function reloadAfterMutation() {
    setData(null)
    setLoadError('')
    revise((value) => value + 1)
    onMutated()
    heading.current?.focus()
  }

  async function remove(place: FarmAnimalPlace) {
    if (!canManage || removing || confirm !== place.herd_id) return
    setRemoving(true)
    setActionError('')
    try {
      await api.deleteLivestock(farmId, place.herd_id)
      setConfirm(null)
      reloadAfterMutation()
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : t('water.removeAnimalsError'))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <section aria-labelledby="dashboard-animals" className="flex flex-col gap-3 p-0.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="dashboard-animals" ref={heading} tabIndex={-1} className="font-serif text-lg text-ink">{t('dashboard.animalTitle')}</h2>
          {data?.groups.length ? <p className="text-xs text-ink-soft">{formatInt(data.total_animals)} animals</p> : null}
        </div>
        {canManage ? (
          <button type="button" disabled={opening || removing || !data} onClick={() => void addAnimals()} className="inline-flex items-center gap-1 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            <Plus size={14} aria-hidden /> {opening ? t('common.loading') : t('water.addAnimals')}
          </button>
        ) : (
          <span className="text-xs text-ink-soft" title={t('dashboard.animalPermission')}>{t('common.readOnly')}</span>
        )}
      </div>
      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-hanko/30 bg-hanko/5 p-3 text-xs text-hanko" role="alert">
          {loadError}
          <button type="button" className="font-medium underline" onClick={() => { setLoadError(''); revise((value) => value + 1) }}>{t('common.retry')}</button>
        </div>
      ) : null}
      {actionError ? <p role="alert" className="text-xs text-hanko">{actionError}</p> : null}
      {!data && !loadError ? <div className="aqua-skel h-28 rounded-card" aria-label={t('dashboard.loadingAnimals')} role="status" /> : null}
      {data?.groups.length === 0 ? <EmptyState text={t('dashboard.animalsEmpty')} /> : null}
      <ul className="grid gap-3">
        {data?.groups.map((group) => (
          <li key={group.species} data-card="" className="min-w-0 rounded-card border border-line bg-paper p-3">
            <div className="flex items-center gap-2">
              <AnimalArt species={group.species} size={58} className="shrink-0" />
              <div className="min-w-0">
                <h3 className="break-words font-serif text-lg leading-tight text-ink">{group.label}</h3>
                <p className="text-xs text-ink-soft">{formatInt(group.total)} total · {litresLabel(group.litres_per_day)} {' '}{t('jobs.daily')}</p>
                <AquaEstimate record={group} note={t('estimates.animalDaily')} />
              </div>
            </div>
            <ul className="mt-2 grid gap-2">
              {group.places.map((place) => {
                const location = place.place?.trim() || t('common.locationMissing')
                return (
                  <li key={place.herd_id} className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="max-w-full break-words rounded-full border border-line bg-cream px-2.5 py-0.5 text-xs font-medium text-ink">
                        {location} · {formatInt(place.count)}
                      </span>
                      {canManage && confirm !== place.herd_id ? (
                        <>
                          <button type="button" disabled={removing} aria-label={t('dashboard.editAnimalsAt', { animal: group.label, location: location })} className="text-xs font-medium text-forest underline disabled:opacity-60" onClick={() => {
                            setConfirm(null)
                            setActionError('')
                            setEditor({ id: place.herd_id, label: group.label, count: place.count, place: place.place })
                          }}>{t('common.edit')}</button>
                          <button type="button" disabled={removing} aria-label={t('dashboard.removeAnimalsAt', { animal: group.label, location: location })} className="text-xs font-medium text-hanko underline disabled:opacity-60" onClick={() => {
                            setActionError('')
                            setConfirm(place.herd_id)
                          }}>{t('common.remove')}</button>
                        </>
                      ) : null}
                    </div>
                    <EnteredBy record={place} />
                    {canManage && confirm === place.herd_id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="break-words text-ink">{t('common.remove')}{' '} {group.label.toLowerCase()} at {location}?</span>
                        <button ref={confirmButton} type="button" disabled={removing} onClick={() => void remove(place)} className="rounded-full bg-forest-deep px-3 py-1 text-white disabled:opacity-60">
                          {removing ? t('common.removing') : t('dashboard.removeConfirm')}
                        </button>
                        <button type="button" disabled={removing} onClick={() => { setConfirm(null); setActionError(''); heading.current?.focus() }} className="rounded-full border border-line px-3 py-1 disabled:opacity-60">{t('common.cancel')}</button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
      {canManage && editor ? (
        <AddHerdDialog
          key={editor === 'add' ? 'add' : editor.id}
          open
          farmId={farmId}
          species={species}
          taken={[]}
          places={data?.places}
          edit={editor === 'add' ? undefined : editor}
          onClose={() => setEditor(null)}
          onCreated={reloadAfterMutation}
        />
      ) : null}
    </section>
  )
}
