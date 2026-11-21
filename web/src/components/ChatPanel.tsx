import { t } from '../i18n'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import {
  FileText,
  MessageSquare,
  Mic,
  Paperclip,
  PanelLeft,
  Plus,
  SendHorizontal,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import {
  ApiError,
  api,
  type ChatAttachment,
  type ChatMessage,
  type OverviewPlot,
} from '../api'
import {
  isSpeechLang,
  readSpeechLang,
  SPEECH_LANGS,
  speechLangLabel,
  useSpeech,
  writeSpeechLang,
  type SpeechLang,
} from '../lib/useSpeech'
import {
  CHAT_ACCEPT,
  CHAT_MAX_FILES,
  isImageType,
  prepareFiles,
  sniffMediaType,
  type PreparedFile,
} from './chat/files'
import { AssistantReply } from './chat/AssistantReply'
import { PlantsStrip } from './chat/PlantsStrip'
import { parseProposedTasks } from './chat/ProposedTasks'
import { parseProposedChanges } from './chat/ProposedChanges'
import {
  loadConversations,
  newChatId,
  newConversation,
  saveConversations,
  titleFrom,
  type ChatAttachmentMeta,
  type ChatLine,
  type Conversation,
} from './chat/storage'
import { useTypewriter } from './chat/useTypewriter'
import { WritingRow } from './chat/WritingBubble'
import { Logo } from './Logo'

type ChatPanelProps = {
  farmId: number | null
  farmName: string
  role: string
  plots: OverviewPlot[]
  loading: boolean
  /** The worker's own assistant: no farm, other suggestions and endpoint. */
  worker?: boolean
}

type FailedSend = {
  farmId: number
  history: ChatMessage[]
  attachments: ChatAttachment[]
}

const WORKER_SUGGESTIONS = [
  { get text() { return t('chat.suggestions.findWork') }, pick: false },
  { get text() { return t('chat.suggestions.invitations') }, pick: false },
  { get text() { return t('chat.suggestions.profile') }, pick: false },
  { get text() { return t('chat.suggestions.available') }, pick: false },
  { get text() { return t('chat.suggestions.late') }, pick: false },
  { get text() { return t('chat.suggestions.next') }, pick: false },
]

const SUGGESTIONS = [
  { get text() { return t('chat.suggestions.tasks') }, pick: false },
  { get text() { return t('chat.suggestions.plots') }, pick: false },
  { get text() { return t('chat.suggestions.supply') }, pick: false },
  { get text() { return t('chat.suggestions.irrigate') }, pick: false },
  { get text() { return t('chat.suggestions.leaf') }, pick: true },
] as const

function chatErrorMessage(e: unknown): string {
  const status = e instanceof ApiError ? e.status : 0
  if (status === 503) {
    return t('chat.disabled')
  }
  if (status === 403) return t('chat.forbidden')
  if (status === 413) return t('chat.filesTooLarge')
  return t('common.tryLater')
}

function AttachmentChip({
  att,
  onRemove,
}: {
  att: ChatAttachmentMeta
  onRemove?: () => void
}) {
  const img = isImageType(att.media_type) && att.previewUrl
  return (
    <span className="relative inline-flex items-center">
      {img ? (
        <img
          src={att.previewUrl}
          alt={att.name}
          className="h-14 w-14 rounded-lg object-cover"
        />
      ) : (
        <span className="inline-flex max-w-[11rem] items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink">
          <FileText size={12} aria-hidden />
          <span className="truncate">{att.name}</span>
        </span>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('common.removeNamed', { name: att.name })}
          className="absolute -top-1.5 -end-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-forest-deep text-white"
        >
          <X size={10} aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

function fitTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  const max = 5 * 24
  el.style.height = `${Math.min(el.scrollHeight, max)}px`
}

export function ChatPanel({ farmId, farmName, role, plots, loading, worker = false }: ChatPanelProps) {
  const areaId = useId()
  const langId = useId()
  const speechStatusId = useId()
  const [lines, setLines] = useState<ChatLine[]>([])
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<PreparedFile[]>([])
  const [fileHint, setFileHint] = useState('')
  const [pending, setPending] = useState(false)
  const [banner, setBanner] = useState('')
  const [failed, setFailed] = useState<FailedSend | null>(null)
  const [confirmDel, setConfirmDel] = useState('')
  const [convs, setConvs] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [speechLang, setSpeechLang] = useState<SpeechLang>(readSpeechLang)

  const listRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const messagesRef = useRef<ChatLine[]>([])
  const convsRef = useRef<Conversation[]>([])
  const activeRef = useRef('')
  const filesRef = useRef<PreparedFile[]>([])
  const seqRef = useRef(0)
  const dragDepth = useRef(0)
  const pendingRef = useRef(false)
  const insertFocusRef = useRef(false)
  const draftRef = useRef('')
  const stickRef = useRef(true)
  const {
    id: typingId,
    shown: typingShown,
    done: typingDone,
    start: startTyping,
    skip: skipTyping,
    reset: resetTyping,
  } = useTypewriter()
  const speech = useSpeech({
    lang: speechLang,
    onText: (text) => {
      draftRef.current = text
      setDraft(text)
    },
  })

  filesRef.current = files
  messagesRef.current = lines
  draftRef.current = draft

  const stopSpeech = speech.stop

  function showConversation(c: Conversation) {
    stopSpeech()
    seqRef.current += 1
    resetTyping()
    stickRef.current = true
    activeRef.current = c.id
    setActiveId(c.id)
    messagesRef.current = c.lines
    setLines(c.lines)
    setBanner('')
    setFailed(null)
    pendingRef.current = false
    setPending(false)
    setConfirmDel('')
    setDraft('')
    setFiles([])
    setFileHint('')
  }

  useEffect(() => {
    const list = farmId == null ? [] : loadConversations(farmId)
    const first = list[0] ?? newConversation()
    convsRef.current = list
    setConvs(list)
    showConversation(first)
    return () => {
      seqRef.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId, stopSpeech, resetTyping])

  useEffect(() => {
    if (!confirmDel) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setConfirmDel('')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirmDel])

  useEffect(() => {
    if (typingDone || !!confirmDel) return
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      skipTyping()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [typingDone, confirmDel, skipTyping])

  useEffect(() => {
    const el = listRef.current
    if (!el || !stickRef.current) return
    el.scrollTop = el.scrollHeight
  }, [lines, pending, typingShown])

  useEffect(() => {
    const el = areaRef.current
    fitTextarea(el)
    if (el && speech.listening) {
      el.scrollTop = el.scrollHeight
      const overlay = overlayRef.current
      if (overlay) overlay.scrollTop = el.scrollTop
    }
    if (!insertFocusRef.current) return
    insertFocusRef.current = false
    if (!el) return
    el.focus()
    const n = el.value.length
    el.setSelectionRange(n, n)
  }, [draft, speech.listening])

  function commit(next: ChatLine[], id: number) {
    const trimmed = next.slice(-40)
    messagesRef.current = trimmed
    setLines(trimmed)
    const aid = activeRef.current
    const others = convsRef.current.filter((c) => c.id !== aid)
    const updated: Conversation = {
      id: aid,
      title: titleFrom(trimmed),
      updated: Date.now(),
      lines: trimmed,
    }
    convsRef.current = [updated, ...others]
    setConvs(convsRef.current)
    saveConversations(id, convsRef.current)
  }

  async function addFiles(incoming: File[]) {
    const { accepted, message } = await prepareFiles(incoming, filesRef.current.length)
    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted].slice(0, CHAT_MAX_FILES))
    }
    setFileHint(message)
  }

  async function postChat(targetFarm: number, history: ChatMessage[], attachments: ChatAttachment[]) {
    pendingRef.current = true
    setPending(true)
    setBanner('')
    const my = seqRef.current
    try {
      const data = worker
        ? await api.workerChat(history.slice(-20), attachments)
        : await api.chat(targetFarm, history.slice(-20), attachments)
      if (my !== seqRef.current) return
      const proposed = parseProposedTasks(data.proposed_tasks)
      const changes = parseProposedChanges(data.proposed_changes)
      const reply: ChatLine = {
        id: newChatId(),
        role: 'assistant',
        content: typeof data.reply === 'string' ? data.reply : '',
        // Kept on the in-memory line only; saveConversation writes role/content/attachments.
        ...(proposed.length > 0 ? { proposed_tasks: proposed } : {}),
        ...(changes.length > 0 ? { proposed_changes: changes } : {}),
      }
      commit([...messagesRef.current, reply], targetFarm)
      startTyping(reply.id, reply.content)
      setFailed(null)
    } catch (e) {
      if (my !== seqRef.current) return
      setBanner(chatErrorMessage(e))
      setFailed({ farmId: targetFarm, history, attachments })
    } finally {
      if (my === seqRef.current) {
        pendingRef.current = false
        setPending(false)
      }
    }
  }

  function sendNow(text: string, attached: PreparedFile[]) {
    if (farmId == null) return
    if (pendingRef.current) return
    const content = text.trim()
    if (!content && attached.length === 0) return
    skipTyping()
    stickRef.current = true
    stopSpeech()
    pendingRef.current = true
    const userLine: ChatLine = {
      id: newChatId(),
      role: 'user',
      content,
      attachments: attached.map((f) => ({
        name: f.name,
        media_type: f.media_type,
        previewUrl: f.previewUrl,
      })),
    }
    commit([...messagesRef.current, userLine], farmId)
    setDraft('')
    setFiles([])
    setFileHint('')
    const history: ChatMessage[] = messagesRef.current.map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const payload: ChatAttachment[] = attached.map((f) => ({
      name: f.name,
      media_type: f.media_type,
      data: f.data,
    }))
    void postChat(farmId, history, payload)
  }

  function onSubmit() {
    stopSpeech()
    sendNow(draftRef.current, files)
  }

  function onRetry() {
    if (!failed || pendingRef.current) return
    if (farmId == null || failed.farmId !== farmId) return
    void postChat(failed.farmId, failed.history, failed.attachments)
  }

  function onAreaKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    onSubmit()
  }

  function onPick() {
    fileRef.current?.click()
  }

  function onFileChange() {
    const input = fileRef.current
    if (!input?.files) return
    void addFiles(Array.from(input.files))
    input.value = ''
  }

  function onPaste(e: ClipboardEvent<HTMLElement>) {
    const bag = e.clipboardData
    if (!bag) return
    const grabbed: File[] = []
    if (bag.files && bag.files.length > 0) {
      grabbed.push(...Array.from(bag.files))
    } else {
      for (let i = 0; i < bag.items.length; i++) {
        const item = bag.items[i]
        if (!item || item.kind !== 'file') continue
        const f = item.getAsFile()
        if (f) grabbed.push(f)
      }
    }
    const usable = grabbed.filter((f) => {
      const t = sniffMediaType(f)
      return t !== null && t.startsWith('image/')
    })
    if (usable.length === 0) return
    e.preventDefault()
    void addFiles(usable)
  }

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  function onDragEnter(e: DragEvent<HTMLElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragLeave(e: DragEvent<HTMLElement>) {
    if (dragDepth.current === 0) return
    e.preventDefault()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDragOver(e: DragEvent<HTMLElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent<HTMLElement>) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void addFiles(Array.from(e.dataTransfer.files))
  }

  function onNewChat() {
    if (pendingRef.current) return
    showConversation(newConversation())
    setPanelOpen(false)
  }

  function onPickConversation(id: string) {
    if (pendingRef.current || id === activeRef.current) return
    const c = convsRef.current.find((x) => x.id === id)
    if (!c) return
    showConversation(c)
    setPanelOpen(false)
  }

  function onDeleteConversation(id: string) {
    if (pendingRef.current) return
    const rest = convsRef.current.filter((c) => c.id !== id)
    convsRef.current = rest
    setConvs(rest)
    if (farmId != null) saveConversations(farmId, rest)
    if (id === activeRef.current) showConversation(rest[0] ?? newConversation())
    setConfirmDel('')
  }

  function insertIntoComposer(snippet: string) {
    insertFocusRef.current = true
    setDraft((prev) => {
      if (!prev) return snippet
      if (prev.endsWith(' ') || prev.endsWith('\n')) return prev + snippet
      return `${prev}${prev.includes('\n') ? '\n' : ' '}${snippet}`
    })
  }

  function onSuggest(text: string, pick: boolean) {
    if (pick) {
      setDraft(text)
      fileRef.current?.click()
      areaRef.current?.focus()
      return
    }
    sendNow(text, [])
  }

  const canSend =
    farmId != null && !pending && (draft.trim().length > 0 || files.length > 0)
  const empty = lines.length === 0 && !pending
  const speechCut =
    speech.listening &&
    speech.interim.length > 0 &&
    speech.interim.length <= draft.length
      ? draft.length - speech.interim.length
      : draft.length
  const micLabel = !speech.supported
    ? t('chat.voiceUnsupported')
    : speech.listening
      ? t('chat.stopVoice')
      : t('chat.speak')

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-paper">
      {panelOpen ? (
        <button
          type="button"
          aria-label={t('chat.closeConversations')}
          onClick={() => setPanelOpen(false)}
          className="absolute inset-0 z-20 bg-forest-deep/30 md:hidden"
        />
      ) : null}
      <aside
        aria-label={t('chat.conversations')}
        className={`${
          panelOpen ? 'flex' : 'hidden'
        } absolute inset-y-0 start-0 z-30 w-72 max-w-[85%] shrink-0 flex-col border-e border-line bg-cream md:static md:flex md:w-64`}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
          <h3 className="font-serif text-base text-ink">{t('chat.conversations')}</h3>
          <button
            type="button"
            onClick={onNewChat}
            disabled={pending}
            aria-label={t('chat.newConversation')}
            className="flex items-center gap-1 rounded-full bg-forest-deep px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            <Plus size={14} aria-hidden /> {' '}{t('common.new')}
          </button>
        </div>
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {convs.length === 0 ? (
            <li className="px-2 py-3 text-xs text-ink-soft">{t('chat.noSaved')}</li>
          ) : null}
          {convs.map((c) => (
            <li key={c.id}>
              {confirmDel === c.id ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-xs">
                  <span className="text-ink">{t('chat.deletePrompt')}</span>
                  <span className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDel('')}
                      className="rounded-full border border-line px-2.5 py-1"
                    >
                      {t('common.no')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteConversation(c.id)}
                      className="rounded-full bg-forest-deep px-2.5 py-1 font-medium text-white"
                    >
                      {t('common.yes')}
                    </button>
                  </span>
                </div>
              ) : (
                <div
                  className={`group flex items-center gap-1 rounded-xl pe-1 ${
                    c.id === activeId ? 'bg-white shadow-shell' : 'hover:bg-cream-deep'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onPickConversation(c.id)}
                    disabled={pending && c.id !== activeId}
                    aria-current={c.id === activeId ? 'true' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-start text-sm text-ink disabled:opacity-50"
                  >
                    <MessageSquare size={14} className="shrink-0 text-ink-soft" aria-hidden />
                    <span className="truncate">{c.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDel(c.id)}
                    disabled={pending}
                    aria-label={t('chat.deleteConversation', { title: c.title })}
                    className="rounded-full p-1.5 text-ink-soft opacity-60 hover:bg-cream hover:opacity-100 focus:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
      <section
        aria-label={t('chat.advisorLabel')}
        onPaste={onPaste}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-paper"
      >
      <header className="flex shrink-0 flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
        <Logo size={28} className="mt-0.5 shrink-0 text-forest" />
        <div className="min-w-0 flex-1">
          <h2
            tabIndex={-1}
            className="font-serif text-lg leading-tight text-ink sm:text-xl"
          >
            {worker ? t('chat.assistantTitle') : t('chat.advisorTitle')}
          </h2>
          <p className="truncate text-xs text-ink-soft">{farmName}</p>
        </div>
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label={t('chat.conversations')}
          aria-expanded={panelOpen}
          className="rounded-full p-1.5 text-ink-soft hover:bg-cream md:hidden"
        >
          <PanelLeft size={16} aria-hidden />
        </button>
      </header>

      {worker ? null : <PlantsStrip plots={plots} loading={loading} onInsert={insertIntoComposer} />}

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-busy={pending || !typingDone}
        onScroll={() => {
          const el = listRef.current
          if (!el) return
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
        }}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
      >
        <div className="mx-auto w-full max-w-3xl">
          {empty ? (
            <div className="flex min-h-[min(28rem,100%)] flex-col justify-center">
              <h3 className="font-serif text-3xl text-ink sm:text-4xl">
                {worker ? t('chat.askWorker') : t('chat.askFarm')}
              </h3>
              <p className="mt-2 text-base text-ink-soft">
                {worker
                  ? t('chat.workerHelp')
                  : t('chat.farmHelp')}
              </p>
              <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(worker ? WORKER_SUGGESTIONS : SUGGESTIONS).map((s) => (
                  <button
                    type="button"
                    key={s.text}
                    onClick={() => onSuggest(s.text, s.pick)}
                    className="min-w-0 rounded-full border border-line bg-cream px-4 py-2 text-start text-sm break-words text-ink hover:bg-cream-deep"
                  >
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {lines.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%]">
                      {m.content ? (
                        <div className="rounded-2xl rounded-ee-md bg-forest-deep px-4 py-2.5 text-base whitespace-pre-wrap break-words text-white">
                          {m.content}
                        </div>
                      ) : null}
                      {m.attachments && m.attachments.length > 0 ? (
                        <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
                          {m.attachments.map((a) => (
                            <AttachmentChip key={`${m.id}-${a.name}`} att={a} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <AssistantReply
                    key={m.id}
                    line={m}
                    farmId={farmId}
                    role={role}
                    worker={worker}
                    typing={typingId === m.id && !typingDone}
                    shown={typingId === m.id ? typingShown : m.content}
                    fadeExtras={typingId === m.id && typingDone}
                    onSkip={skipTyping}
                  />
                ),
              )}
              {pending ? <WritingRow /> : null}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {banner ? (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-hanko/30 bg-hanko/10 px-3 py-2 text-sm text-ink"
            >
              <p className="min-w-0 flex-1">{banner}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={pending || !failed}
                  className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                >
                  {t('common.retryAction')}
                </button>
                <button
                  type="button"
                  onClick={() => setBanner('')}
                  aria-label={t('chat.dismissError')}
                  className="rounded-full p-1 text-ink-soft hover:bg-white/70"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : null}
          <div className="rounded-card border border-line bg-white p-3 shadow-shell">
            {files.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((f) => (
                  <AttachmentChip
                    key={f.id}
                    att={{
                      name: f.name,
                      media_type: f.media_type,
                      previewUrl: f.previewUrl,
                    }}
                    onRemove={() => {
                      setFiles((prev) => prev.filter((x) => x.id !== f.id))
                      setFileHint('')
                    }}
                  />
                ))}
              </div>
            ) : null}
            {fileHint ? (
              <p className="mb-2 text-sm text-hanko" role="alert">
                {fileHint}
              </p>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-end gap-2">
              <button
                type="button"
                onClick={onPick}
                aria-label={t('chat.attach')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-cream"
              >
                <Paperclip size={18} aria-hidden />
              </button>
              <label htmlFor={areaId} className="sr-only">
                {t('common.message')}
              </label>
              <div className="relative min-h-10 min-w-[8rem] flex-1 basis-40">
                {speech.listening ? (
                  <div
                    ref={overlayRef}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl border border-transparent px-3 py-2 text-base leading-normal break-words whitespace-pre-wrap"
                  >
                    <span className="text-ink">{draft.slice(0, speechCut)}</span>
                    <span className="text-ink-soft">{draft.slice(speechCut)}</span>
                  </div>
                ) : null}
                <textarea
                  id={areaId}
                  ref={areaRef}
                  rows={1}
                  value={draft}
                  readOnly={speech.listening}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onAreaKey}
                  onScroll={(e) => {
                    const overlay = overlayRef.current
                    if (overlay) overlay.scrollTop = e.currentTarget.scrollTop
                  }}
                  placeholder={
                    speech.listening ? '' : worker ? t('chat.workerPlaceholder') : t('chat.farmPlaceholder')
                  }
                  className={`max-h-[7.5rem] min-h-10 w-full resize-none rounded-2xl border border-line px-3 py-2 text-base leading-normal placeholder:text-ink-soft ${
                    speech.listening
                      ? 'relative z-10 bg-transparent text-transparent caret-ink'
                      : 'bg-white text-ink'
                  }`}
                />
              </div>
              <label htmlFor={langId} className="sr-only">
                {t('chat.voiceLanguage')}
              </label>
              <select
                id={langId}
                value={speechLang}
                disabled={!speech.supported}
                title={
                  speech.supported
                    ? speechLangLabel(speechLang)
                    : t('chat.voiceUnsupported')
                }
                onChange={(e) => {
                  const next = e.target.value
                  if (!isSpeechLang(next)) return
                  setSpeechLang(next)
                  writeSpeechLang(next)
                }}
                className="h-10 w-[8rem] max-w-full shrink-0 rounded-full border border-line bg-white px-2 text-xs text-ink disabled:opacity-40"
              >
                {SPEECH_LANGS.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => speech.toggle(draft)}
                disabled={!speech.supported}
                aria-label={micLabel}
                aria-pressed={speech.listening}
                aria-describedby={
                  speech.error ||
                  speech.listening
                    ? speechStatusId
                    : undefined
                }
                title={micLabel}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  !speech.supported
                    ? 'text-ink-soft opacity-40'
                    : speech.listening
                      ? 'bg-hanko text-white motion-safe:animate-pulse'
                      : 'text-ink-soft hover:bg-cream'
                }`}
              >
                {speech.listening ? (
                  <Square size={16} aria-hidden />
                ) : (
                  <Mic size={18} aria-hidden />
                )}
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                aria-label={t('chat.send')}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-deep text-white disabled:opacity-40"
              >
                <SendHorizontal className="rtl:-scale-x-100" size={16} aria-hidden />
              </button>
            </div>
            <div
              id={speechStatusId}
              className={
                speech.error || speech.listening
                  ? 'mt-2 space-y-1'
                  : undefined
              }
            >
              <div aria-live="polite">
                {speech.error ? (
                  <p className="text-xs text-hanko" role="alert">
                    {speech.error}
                  </p>
                ) : speech.listening ? (
                  <p className="text-xs text-ink-soft">
                    {t('chat.listening')}{' '} {speechLangLabel(speechLang)}
                    {speech.interim ? (
                      <span className="text-mute"> “{speech.interim}”</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={CHAT_ACCEPT}
              onChange={onFileChange}
              className="sr-only"
              tabIndex={-1}
            />
          </div>
        </div>
      </div>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center border-2 border-dashed border-ochre bg-ochre/20">
          <p className="rounded-full bg-white px-4 py-2 font-serif text-lg text-ink shadow-shell">
            {t('chat.dropFiles')}
          </p>
        </div>
      ) : null}
    </section>
    </div>
  )
}
