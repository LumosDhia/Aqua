import { t } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { EnteredBy, AquaEstimate } from '../EnteredBy'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { PawPrint, Trash2 } from 'lucide-react'
import { ApiError, api, canManageWater, type LivestockHerd } from '../../api'
import { formatInt } from '../../lib/status'
import { litresLabel, litresPrecise } from './format'

export function AnimalsTab({
  farmId,
  role,
  herds,
  loading,
  highlightId,
  onAdd,
  onHerdsChange,
  onMutated,
}: {
  farmId: number | null
  role: string
  herds: LivestockHerd[]
  loading: boolean
  highlightId: number | null
  onAdd?: () => void
  onHerdsChange: (next: LivestockHerd[] | ((prev: LivestockHerd[]) => LivestockHerd[])) => void
  onMutated: () => void
}) {
  const canManage = canManageWater(role)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [editId, setEditId] = useState<number | null>(null)
  const [removeErr, setRemoveErr] = useState('')

  useEffect(() => {
    setConfirmId(null)
    setEditId(null)
    setRemoveErr('')
  }, [farmId])

  async function onRemove(herd: LivestockHerd) {
    if (farmId == null) return
    setRemoveErr('')
    try {
      await api.deleteLivestock(farmId, herd.id)
      onHerdsChange((list) => list.filter((h) => h.id !== herd.id))
      setConfirmId(null)
      onMutated()
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onHerdsChange((list) => list.filter((h) => h.id !== herd.id))
        setConfirmId(null)
        onMutated()
        return
      }
      setRemoveErr(error instanceof ApiError ? error.message : t('water.removeAnimalsError'))
    }
  }

  if (loading) {
    return <AnimalsSkeleton />
  }

  if (herds.length === 0) {
    return (
      <EmptyState
        text={t('water.animalEmpty')}
        action={canManage && onAdd
          ? { label: t('water.addAnimals'), onClick: onAdd }
          : { label: t('water.addAnimals'), disabledReason: farmId == null ? t('common.selectFarm') : t('water.addAnimalsForbidden') }}
      />
    )
  }

  return (
    <div className="space-y-3">
      {removeErr ? (
        <p className="text-sm text-hanko" role="alert">
          {removeErr}
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {herds.map((h) => (
          <HerdCard
            key={h.id}
            farmId={farmId}
            herd={h}
            canManage={canManage}
            confirm={confirmId === h.id}
            editing={editId === h.id}
            highlight={highlightId === h.id}
            onAskRemove={() => {
              setEditId(null)
              setConfirmId(h.id)
              setRemoveErr('')
            }}
            onCancelRemove={() => {
              setConfirmId(null)
              setRemoveErr('')
            }}
            onRemove={() => void onRemove(h)}
            onEdit={() => {
              setConfirmId(null)
              setEditId(h.id)
            }}
            onCancelEdit={() => setEditId(null)}
            onSaved={(next) => {
              onHerdsChange((list) => list.map((row) => (row.id === next.id ? next : row)))
              setEditId(null)
              onMutated()
            }}
          />
        ))}
      </ul>
    </div>
  )
}

function HerdCard({
  farmId,
  herd,
  canManage,
  confirm,
  editing,
  highlight,
  onAskRemove,
  onCancelRemove,
  onRemove,
  onEdit,
  onCancelEdit,
  onSaved,
}: {
  farmId: number | null
  herd: LivestockHerd
  canManage: boolean
  confirm: boolean
  editing: boolean
  highlight: boolean
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onSaved: (next: LivestockHerd) => void
}) {
  return (
    <li
      data-card=""
      className={`min-w-0 rounded-card border border-line p-3 ${
        highlight ? 'bg-leaf-soft/40 ring-2 ring-leaf' : 'bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-forest"
          aria-hidden
        >
          <PawPrint size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-serif text-lg leading-tight text-ink">{herd.label}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{formatInt(herd.count)}</p>
              {herd.place ? <p className="mt-0.5 break-words text-xs text-ink-soft">{herd.place}</p> : null}
            </div>
            {canManage && !confirm && !editing ? (
              <button
                type="button"
                onClick={onAskRemove}
                aria-label={t('common.removeNamed', { name: herd.label })}
                title={t('common.removeNamed', { name: herd.label })}
                className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-cream hover:text-hanko"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {litresPrecise(herd.litres_per_head_per_day)} {' '}{t('water.perAnimal')}
          </p>
          <p className="mt-1 text-sm text-ink">{litresLabel(herd.litres_per_day)} {' '}{t('jobs.daily')}</p>
          <p className="text-xs break-words text-ink-soft">{herd.place?.trim() || t('common.locationMissing')}</p>
          <AquaEstimate record={herd} note={t('estimates.herd')} />
          <EnteredBy record={herd} />

          {canManage && confirm ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <p className="text-ink">{t('common.remove')}{' '} {herd.label}?</p>
              <button
                type="button"
                onClick={onRemove}
                className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white"
              >
                {t('common.yes')}
              </button>
              <button
                type="button"
                onClick={onCancelRemove}
                className="rounded-full border border-line px-3 py-1 text-xs"
              >
                {t('common.no')}
              </button>
            </div>
          ) : null}

          {canManage && editing && farmId != null ? (
            <CountEditor
              farmId={farmId}
              herd={herd}
              onCancel={onCancelEdit}
              onSaved={onSaved}
            />
          ) : null}

          {canManage && !confirm && !editing ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white"
              >
                {t('water.editHerd')}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function CountEditor({
  farmId,
  herd,
  onCancel,
  onSaved,
}: {
  farmId: number
  herd: LivestockHerd
  onCancel: () => void
  onSaved: (next: LivestockHerd) => void
}) {
  const inputId = useId()
  const placeId = useId()
  const errId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel
  const [raw, setRaw] = useState(String(herd.count))
  const [place, setPlace] = useState(herd.place ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancelRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    const n = Math.round(Number(raw))
    if (!Number.isFinite(n) || n < 1) {
      setErr(t('water.animalCountInvalid'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const next = await api.updateLivestock(farmId, herd.id, { count: n, place: place.trim() })
      onSaved(next)
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('water.updateCountError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="mt-3 space-y-2" onSubmit={onSave} aria-label={t('water.editNamedHerd', { animal: herd.label })}>
      <div>
        <label htmlFor={inputId} className="text-xs font-medium text-ink-soft">
          {t('water.count')}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={busy}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? errId : undefined}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        />
      </div>
      <div>
        <label htmlFor={placeId} className="text-xs font-medium text-ink-soft">{t('water.animalLocation')}</label>
        <input
          id={placeId}
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          disabled={busy}
          maxLength={60}
          className="mt-1 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        />
      </div>
      {err ? (
        <p id={errId} className="text-sm text-hanko" role="alert">
          {err}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-line px-3 py-1 text-xs disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

function AnimalsSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <li key={i} className="min-w-0 rounded-card border border-line bg-white p-3">
          <div className="flex gap-3">
            <div className="aqua-skel h-9 w-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="aqua-skel h-4 w-2/3 rounded" />
              <div className="aqua-skel h-3 w-1/2 rounded" />
              <div className="aqua-skel h-3 w-1/3 rounded" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
