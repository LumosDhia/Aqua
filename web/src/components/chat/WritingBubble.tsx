import { t } from '../../i18n'
import { Leaf } from 'lucide-react'

export function LeafAvatar() {
  return (
    <div
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leaf-soft text-forest"
      aria-hidden
    >
      <Leaf size={16} />
    </div>
  )
}

export function WritingBubble() {
  return (
    <div className="flex min-h-[2.75rem] min-w-0 items-center gap-2 rounded-2xl rounded-es-md border border-line bg-cream px-4 py-2.5">
      <span className="flex shrink-0 items-center gap-1" aria-hidden>
        <span className="aqua-write-dot" />
        <span className="aqua-write-dot" />
        <span className="aqua-write-dot" />
      </span>
      <span className="min-w-0 text-sm break-words text-ink-soft">{t('chat.writing')}</span>
    </div>
  )
}

export function WritingRow() {
  return (
    <div className="flex items-start gap-3">
      <LeafAvatar />
      <div className="min-w-0 max-w-[85%]">
        <WritingBubble />
      </div>
    </div>
  )
}
