import { t } from '../i18n'
import { useEffect, useMemo, useState } from 'react'
import { ApiError, api, type DirectoryPerson } from '../api'
import { formatInt } from '../lib/status'
import { MemberCard } from './members/MemberCard'
import { PersonProfileDialog } from './members/PersonProfileDialog'

type MembersPanelProps = {
  farmId: number | null
  role: string
  onSeeFarm: (farmId: number) => void
}

const ALL = ''

export function MembersPanel({ farmId, role, onSeeFarm }: MembersPanelProps) {
  const [people, setPeople] = useState<DirectoryPerson[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [skill, setSkill] = useState(ALL)
  const [gov, setGov] = useState(ALL)
  const [looking, setLooking] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setReady(false)
    setError('')
    void (async () => {
      try {
        const page = await api.members(farmId)
        if (ctrl.signal.aborted) return
        setPeople(page.items)
      } catch (e) {
        if (ctrl.signal.aborted) return
        setPeople([])
        setError(e instanceof ApiError ? e.message : t('members.loadError'))
      } finally {
        if (!ctrl.signal.aborted) setReady(true)
      }
    })()
    return () => ctrl.abort()
  }, [farmId])

  const needle = q.trim().toLowerCase()
  const searched = useMemo(() => {
    if (!needle) return people
    return people.filter((person) => {
      const blob = [person.name, person.governorate, ...person.skills].join(' ').toLowerCase()
      return blob.includes(needle)
    })
  }, [people, needle])

  const skills = useMemo(() => {
    const counts = new Map<string, number>()
    for (const person of searched) {
      for (const item of person.skills) counts.set(item, (counts.get(item) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [searched])

  const governorates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const person of searched) {
      const name = person.governorate.trim()
      if (!name) continue
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [searched])

  const lookingCount = searched.filter((person) => person.looking_for_work).length

  const shown = searched.filter((person) => {
    if (skill && !person.skills.includes(skill)) return false
    if (gov && person.governorate !== gov) return false
    if (looking && !person.looking_for_work) return false
    return true
  })

  const selected = people.find((person) => person.user_id === openId) ?? null

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <h2 tabIndex={-1} className="shrink-0 font-serif text-2xl text-ink outline-none">{t('shell.members')}</h2>
      <p className="mt-1 shrink-0 text-sm text-ink-soft">{t('members.subtitle')}</p>
      <div className="mt-4 flex shrink-0 flex-col gap-2">
        <label className="min-w-0 text-sm text-ink">
          <span className="mb-1 block text-ink-soft">{t('common.search')}</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('members.searchHint')}
            className="w-full min-w-0 rounded-card border border-line bg-paper px-3 py-2 text-sm text-ink"
          />
        </label>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="min-w-0 text-sm text-ink">
            <span className="mb-1 block text-ink-soft">{t('members.specialty')}</span>
            <select value={skill} onChange={(e) => setSkill(e.target.value)} className="w-full min-w-0 rounded-card border border-line bg-paper px-3 py-2 text-sm">
              <option value={ALL}>All ({formatInt(searched.length)})</option>
              {skills.map(([name, count]) => (
                <option key={name} value={name}>{name} ({formatInt(count)})</option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm text-ink">
            <span className="mb-1 block text-ink-soft">{t('common.governorate')}</span>
            <select value={gov} onChange={(e) => setGov(e.target.value)} className="w-full min-w-0 rounded-card border border-line bg-paper px-3 py-2 text-sm">
              <option value={ALL}>All ({formatInt(searched.length)})</option>
              {governorates.map(([name, count]) => (
                <option key={name} value={name}>{name} ({formatInt(count)})</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 items-end gap-2 pb-2 text-sm text-ink">
            <input type="checkbox" checked={looking} onChange={(e) => setLooking(e.target.checked)} />
            Looking for work ({formatInt(lookingCount)})
          </label>
        </div>
      </div>
      <div className="page-scroll mt-4 min-h-0 flex-1">
        {!ready ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
            <div className="aqua-skel h-40 rounded-card" />
            <div className="aqua-skel h-40 rounded-card" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-hanko">{error}</p>
        ) : people.length === 0 ? (
          <p role="status" className="text-sm text-ink-soft">{t('members.empty')}</p>
        ) : shown.length === 0 ? (
          <p role="status" className="text-sm text-ink-soft">{t('members.noMatch')}</p>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((person) => (
              <MemberCard key={person.user_id} person={person} onOpen={() => setOpenId(person.user_id)} />
            ))}
          </div>
        )}
      </div>
      <PersonProfileDialog
        open={openId != null}
        userId={openId}
        farmId={farmId}
        role={role}
        worksAt={selected?.works_at ?? null}
        onClose={() => setOpenId(null)}
        onSeeFarm={onSeeFarm}
      />
    </div>
  )
}
