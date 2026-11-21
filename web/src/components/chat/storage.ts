import { t } from '../../i18n'
import type { ChatRole, ProposedChange, ProposedTask } from '../../api'

const PREFIX = 'aqua_chat_'
const LIMIT = 40

export type ChatAttachmentMeta = {
  name: string
  media_type: string
  previewUrl?: string
}

export type ChatLine = {
  id: string
  role: ChatRole
  content: string
  attachments?: ChatAttachmentMeta[]
  proposed_tasks?: ProposedTask[]
  proposed_changes?: ProposedChange[]
}

export function newChatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isMeta(v: unknown): v is ChatAttachmentMeta {
  if (!v || typeof v !== 'object') return false
  const o = v as { name?: unknown; media_type?: unknown }
  return typeof o.name === 'string' && typeof o.media_type === 'string'
}

function isLine(v: unknown): v is ChatLine {
  if (!v || typeof v !== 'object') return false
  const o = v as {
    id?: unknown
    role?: unknown
    content?: unknown
    attachments?: unknown
  }
  if (typeof o.id !== 'string') return false
  if (o.role !== 'user' && o.role !== 'assistant') return false
  if (typeof o.content !== 'string') return false
  if (o.attachments === undefined) return true
  return Array.isArray(o.attachments) && o.attachments.every(isMeta)
}

function toStored(line: ChatLine): ChatLine {
  const attachments = line.attachments?.map((a) => ({
    name: a.name,
    media_type: a.media_type,
  }))
  return {
    id: line.id,
    role: line.role,
    content: line.content,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  }
}

export type Conversation = {
  id: string
  title: string
  updated: number
  lines: ChatLine[]
}

const LIST_PREFIX = 'aqua_chats_'
const MAX_CONVERSATIONS = 50

function isConversation(v: unknown): v is Conversation {
  if (!v || typeof v !== 'object') return false
  const o = v as { id?: unknown; title?: unknown; updated?: unknown; lines?: unknown }
  return (
    typeof o.id === 'string' &&
    typeof o.title === 'string' &&
    typeof o.updated === 'number' &&
    Array.isArray(o.lines)
  )
}

function cleanLines(raw: unknown[]): ChatLine[] {
  return raw.filter(isLine).slice(-LIMIT).map(toStored)
}

export function titleFrom(lines: ChatLine[]): string {
  const first = lines.find((l) => l.role === 'user')
  const text = (first?.content ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return first?.attachments?.length ? t('common.photo') : t('chat.newChat')
  return text.length > 48 ? `${text.slice(0, 48)}...` : text
}

export function newConversation(): Conversation {
  return { id: newChatId(), title: t('chat.newChat'), updated: Date.now(), lines: [] }
}

/** All conversations for a farm, newest first. Migrates the old single-thread key once. */
export function loadConversations(farmId: number): Conversation[] {
  try {
    const raw = localStorage.getItem(LIST_PREFIX + String(farmId))
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .filter(isConversation)
          .map((c) => ({ ...c, lines: cleanLines(c.lines) }))
          .sort((a, b) => b.updated - a.updated)
      }
    }
    const old = loadConversation(farmId)
    if (old.length > 0) {
      const migrated: Conversation = {
        id: newChatId(),
        title: titleFrom(old),
        updated: Date.now(),
        lines: old,
      }
      saveConversations(farmId, [migrated])
      clearConversation(farmId)
      return [migrated]
    }
  } catch {
    /* ignore */
  }
  return []
}

export function saveConversations(farmId: number, list: Conversation[]): void {
  try {
    const payload = list
      .filter((c) => c.lines.length > 0)
      .sort((a, b) => b.updated - a.updated)
      .slice(0, MAX_CONVERSATIONS)
      .map((c) => ({ ...c, lines: c.lines.slice(-LIMIT).map(toStored) }))
    localStorage.setItem(LIST_PREFIX + String(farmId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function loadConversation(farmId: number): ChatLine[] {
  try {
    const raw = localStorage.getItem(PREFIX + String(farmId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isLine).slice(-LIMIT).map((line) => ({
      id: line.id,
      role: line.role,
      content: line.content,
      ...(line.attachments && line.attachments.length > 0
        ? {
            attachments: line.attachments.map((a) => ({
              name: a.name,
              media_type: a.media_type,
            })),
          }
        : {}),
    }))
  } catch {
    return []
  }
}

export function saveConversation(farmId: number, lines: ChatLine[]): void {
  try {
    const payload = lines.slice(-LIMIT).map(toStored)
    localStorage.setItem(PREFIX + String(farmId), JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function clearConversation(farmId: number): void {
  try {
    localStorage.removeItem(PREFIX + String(farmId))
  } catch {
    /* ignore */
  }
}
