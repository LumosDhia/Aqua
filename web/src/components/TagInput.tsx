import { t } from '../i18n'
import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X } from 'lucide-react'

type TagInputProps = {
  id: string
  tags: string[]
  onChange: (tags: string[]) => void
  maxTags: number
  maxLength: number
  disabled?: boolean
  describedBy?: string
  fullTitle: string
  itemWord: string
  onError?: (message: string) => void
}

export function TagInput({
  id,
  tags,
  onChange,
  maxTags,
  maxLength,
  disabled = false,
  describedBy,
  fullTitle,
  itemWord,
  onError,
}: TagInputProps) {
  const [draft, setDraft] = useState('')
  const atMax = tags.length >= maxTags
  const limitTitle = atMax ? fullTitle : undefined

  function addTags(raw: string) {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length === 0) return
    onError?.('')
    const next = tags.slice()
    const seen = new Set(next.map((s) => s.toLowerCase()))
    for (const part of parts) {
      if (next.length >= maxTags) break
      if (part.length > maxLength) {
        onError?.(t('forms.tagLength', { field: itemWord, maximum: maxLength }))
        continue
      }
      const key = part.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(part)
    }
    onChange(next)
  }

  function onKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTags(draft)
      setDraft('')
      return
    }
    if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault()
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-line bg-white px-2 py-1.5">
      {tags.map((s, i) => (
        <span
          key={`${s}-${i}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest"
        >
          <span className="truncate">{s}</span>
          <button
            type="button"
            onClick={() => onChange(tags.filter((x) => x !== s))}
            aria-label={t('common.removeNamed', { name: s })}
            disabled={disabled}
            className="rounded-full text-forest hover:text-hanko"
          >
            <X size={12} aria-hidden />
          </button>
        </span>
      ))}
      <span title={limitTitle} className="min-w-[8rem] flex-1">
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            const v = e.target.value
            if (v.includes(',')) {
              addTags(v)
              setDraft('')
              return
            }
            setDraft(v)
          }}
          onKeyDown={onKey}
          onBlur={() => {
            if (draft.trim()) {
              addTags(draft)
              setDraft('')
            }
          }}
          maxLength={maxLength}
          disabled={disabled || atMax}
          title={limitTitle}
          aria-describedby={describedBy}
          dir="auto"
          className="w-full min-w-0 bg-transparent py-1 text-sm text-ink"
        />
      </span>
    </div>
  )
}
