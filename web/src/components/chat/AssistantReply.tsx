import { t } from '../../i18n'
import type { KeyboardEvent } from 'react'
import { canAssignTasks, canDecide } from '../../api'
import { FormatMessage } from './formatMessage'
import { ProposedTasks } from './ProposedTasks'
import { ProposedChanges } from './ProposedChanges'
import { safeReveal } from './safeReveal'
import type { ChatLine } from './storage'
import { LeafAvatar, WritingBubble } from './WritingBubble'

export function AssistantReply({
  line,
  farmId,
  role,
  typing,
  shown,
  fadeExtras,
  onSkip,
  worker = false,
}: {
  line: ChatLine
  farmId: number | null
  role: string
  typing: boolean
  shown: string
  fadeExtras: boolean
  onSkip: () => void
  worker?: boolean
}) {
  const raw = typing ? shown : line.content
  const text = typing ? safeReveal(raw, line.content) : line.content
  const waiting = typing && text.length === 0
  const hasTasks = Boolean(line.proposed_tasks && line.proposed_tasks.length > 0)
  const hasChanges = Boolean(line.proposed_changes && line.proposed_changes.length > 0)
  const showBubble = line.content.length > 0 || !(hasTasks || hasChanges) || typing
  const extras = !typing

  function onBubbleKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onSkip()
  }

  return (
    <div className="flex items-start gap-3">
      <LeafAvatar />
      <div className="min-w-0 max-w-[85%] space-y-2">
        {waiting ? (
          <WritingBubble />
        ) : showBubble ? (
          <div
            dir="auto"
            className={`rounded-2xl rounded-es-md border border-line bg-cream px-4 py-2.5 text-ink ${
              typing ? 'cursor-pointer' : ''
            }`}
            onMouseDown={
              typing
                ? (e) => {
                    e.preventDefault()
                  }
                : undefined
            }
            onClick={typing ? onSkip : undefined}
            onKeyDown={typing ? onBubbleKey : undefined}
            role={typing ? 'button' : undefined}
            tabIndex={typing ? 0 : undefined}
            title={typing ? t('chat.showReply') : undefined}
            aria-label={typing ? t('chat.showReplyWhileWriting') : undefined}
          >
            <div aria-hidden={typing || undefined}>
              <FormatMessage text={text} caret={typing} />
            </div>
          </div>
        ) : null}
        {extras && hasChanges && line.proposed_changes ? (
          <div className={fadeExtras ? 'aqua-enter' : undefined}>
            <ProposedChanges
              farmId={farmId}
              messageId={line.id}
              changes={line.proposed_changes}
              canChange={worker || canDecide(role)}
            />
          </div>
        ) : null}
        {extras && hasTasks && line.proposed_tasks ? (
          <div className={fadeExtras ? 'aqua-enter' : undefined}>
            <ProposedTasks
              farmId={farmId}
              messageId={line.id}
              tasks={line.proposed_tasks}
              canAssign={canAssignTasks(role)}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
