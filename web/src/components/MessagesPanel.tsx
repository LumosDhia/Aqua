import { t, countLabel } from '../i18n'
import { EnteredBy } from './EnteredBy'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { ArrowUp, ChevronLeft } from 'lucide-react'
import {
  ApiError,
  api,
  type EngagementMessage,
  type MessageThread,
} from '../api'
import { formatInt, initials } from '../lib/status'
import { jobsHref, messagesHref, peekMessagesEngagement, VIEW_HREF } from '../lib/view'
import { Chip } from './market/Chip'
import {
  messageDayKey,
  messageDayLabel,
  threadWhen,
} from './messages/format'
import { EmptyState } from './EmptyState'
import { PageFrame } from './PageFrame'
import { engagementStatusMeta } from './workers/engagement'

const BODY_MAX = 1000
const COUNTER_FROM = 800
const THREAD_POLL_MS = 20_000
const CONV_POLL_MS = 8_000

type MessagesPanelProps = {
  side: 'farm' | 'worker'
  onUnreadChange?: () => void
}

export function MessagesPanel({ side, onUnreadChange }: MessagesPanelProps) {
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [threadsReady, setThreadsReady] = useState(false)
  const [threadErr, setThreadErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [openId, setOpenId] = useState<number | null>(() => peekMessagesEngagement())
  const [lines, setLines] = useState<EngagementMessage[]>([])
  const [convReady, setConvReady] = useState(false)
  const [convErr, setConvErr] = useState('')
  const [convRetry, setConvRetry] = useState(0)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const threadSeq = useRef(0)
  const convSeq = useRef(0)
  const lineCountRef = useRef(0)
  const areaId = useId()
  const draft = openId != null ? (drafts[openId] ?? '') : ''
  const openThread = threads.find((t) => t.engagement_id === openId) ?? null

  useEffect(() => {
    function onHash() {
      setOpenId(peekMessagesEngagement())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    let cancelled = false
    threadSeq.current += 1
    const my = threadSeq.current

    async function load(isPoll: boolean) {
      if (document.hidden) return
      try {
        const rows = await api.messageThreads()
        if (cancelled || my !== threadSeq.current) return
        setThreads(rows)
        setThreadErr('')
      } catch (e) {
        if (cancelled || my !== threadSeq.current || isPoll) return
        setThreadErr(e instanceof ApiError ? e.message : t('messages.loadListError'))
      } finally {
        if (!cancelled && my === threadSeq.current && !isPoll) setThreadsReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, THREAD_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      threadSeq.current += 1
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [retryTick])

  useEffect(() => {
    if (openId == null) {
      setLines([])
      setConvReady(false)
      setConvErr('')
      setSendErr('')
      setSending(false)
      return
    }

    let cancelled = false
    convSeq.current += 1
    const my = convSeq.current
    const id = openId
    stickRef.current = true
    lineCountRef.current = 0
    setConvReady(false)
    setConvErr('')
    setSendErr('')

    async function load(isPoll: boolean) {
      if (document.hidden) return
      try {
        const rows = await api.engagementMessages(id)
        if (cancelled || my !== convSeq.current) return
        const grew = isPoll && rows.length > lineCountRef.current
        lineCountRef.current = rows.length
        setLines(rows)
        setConvErr('')
        if (!isPoll) {
          setThreads((prev) =>
            prev.map((t) => (t.engagement_id === id ? { ...t, unread: 0 } : t)),
          )
          onUnreadChange?.()
        } else if (grew) {
          onUnreadChange?.()
        }
      } catch (e) {
        if (cancelled || my !== convSeq.current || isPoll) return
        setLines([])
        setConvErr(e instanceof ApiError ? e.message : t('messages.loadConversationError'))
      } finally {
        if (!cancelled && my === convSeq.current && !isPoll) setConvReady(true)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, CONV_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      convSeq.current += 1
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [openId, convRetry, onUnreadChange])

  useEffect(() => {
    if (!stickRef.current) return
    const el = logRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines, openId, convReady])

  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [draft, openId])

  function selectThread(id: number) {
    const href = messagesHref(id)
    if (window.location.hash !== href) {
      window.location.hash = href
      return
    }
    setOpenId(id)
  }

  function onBack() {
    if (window.location.hash !== VIEW_HREF.messages) {
      window.location.hash = VIEW_HREF.messages
      return
    }
    setOpenId(null)
  }

  function onLogScroll() {
    const el = logRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  function setDraft(value: string) {
    if (openId == null) return
    const clipped = value.slice(0, BODY_MAX)
    setDrafts((prev) => ({ ...prev, [openId]: clipped }))
  }

  async function send() {
    if (openId == null || sending) return
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setSendErr('')
    try {
      const created = await api.sendEngagementMessage(openId, text)
      const id = openId
      setDrafts((prev) => ({ ...prev, [id]: '' }))
      stickRef.current = true
      setLines((prev) => {
        const next = prev.some((m) => m.id === created.id) ? prev : [...prev, created]
        lineCountRef.current = next.length
        return next
      })
      setThreads((prev) => {
        const next = prev.map((t) =>
          t.engagement_id === id
            ? {
                ...t,
                last_message: created.body.slice(0, 120),
                last_at: created.created_at,
                entered_by: created.entered_by,
                updated_by: created.updated_by,
                unread: 0,
              }
            : t,
        )
        next.sort((a, b) => (a.last_at < b.last_at ? 1 : a.last_at > b.last_at ? -1 : 0))
        return next
      })
      onUnreadChange?.()
    } catch (e) {
      setSendErr(e instanceof ApiError ? e.message : t('messages.sendError'))
    } finally {
      setSending(false)
    }
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey) return
    if (e.nativeEvent.isComposing) return
    e.preventDefault()
    void send()
  }

  function onComposerSubmit(e: FormEvent) {
    e.preventDefault()
    void send()
  }

  const n = threads.length
  const summary = threadsReady
    ? n === 1
      ? '1 conversation'
      : `${formatInt(n)} conversations`
    : ''
  const emptyCopy =
    side === 'worker'
      ? t('messages.emptyWorker')
      : t('messages.emptyFarm')
  const canSend = openId != null && !sending && draft.trim().length > 0
  const showCounter = draft.length >= COUNTER_FROM
  const showList = openId == null
  const showConv = openId != null

  return (
    <PageFrame
      demonstration={threads.some((thread) => thread.demo)}
      label={t('shell.messages')}
      busy={!threadsReady}
      body="contain"
      header={
        <header className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
              {t('shell.messages')}
            </h2>
            {threadsReady ? (
              <p className="text-xs text-ink-soft">{summary}</p>
            ) : (
              <p className="aqua-skel mt-1 h-3 w-36 rounded" aria-hidden />
            )}
          </div>
        </header>
      }
    >
      {threadErr && threads.length === 0 && threadsReady ? (
        <div
          role="alert"
          className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
        >
          <p>{threadErr}</p>
          <button
            type="button"
            onClick={() => {
              setThreadErr('')
              setThreadsReady(false)
              setRetryTick((n) => n + 1)
            }}
            className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      <div
        data-card=""
        className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-white shadow-shell"
      >
        <div
          className={`min-h-0 min-w-0 flex-col border-line md:flex md:w-[18rem] md:shrink-0 md:border-e lg:w-[22rem] ${
            showList ? 'flex flex-1 md:flex-none' : 'hidden md:flex'
          }`}
        >
          <nav aria-label={t('chat.conversations')} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {!threadsReady ? (
              <ThreadListSkeleton />
            ) : threads.length === 0 ? (
              <EmptyState
                text={emptyCopy}
                action={side === 'worker'
                  ? { label: t('shell.findWork'), href: jobsHref('browse') }
                  : { label: t('workers.viewPosts'), href: jobsHref('mine') }}
              />
            ) : (
              <ul className="page-scroll min-h-0 flex-1">
                {threads.map((thread) => (
                  <li key={thread.engagement_id} className="min-w-0 border-b border-line last:border-b-0">
                    <ThreadRow
                      thread={thread}
                      active={thread.engagement_id === openId}
                      onOpen={() => selectThread(thread.engagement_id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </div>

        <div
          className={`min-h-0 min-w-0 flex-1 flex-col ${
            showConv ? 'flex' : 'hidden md:flex'
          }`}
        >
          {openId == null ? (
            <div className="flex h-full min-h-0 flex-col items-center justify-center px-4 py-12 text-center">
              <p className="font-serif text-xl text-ink">{t('messages.select')}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {t('messages.privacy')}
              </p>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start gap-2 border-b border-line px-3 py-2.5 sm:px-4">
                <button
                  type="button"
                  onClick={onBack}
                  aria-label={t('messages.back')}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-cream md:hidden"
                >
                  <ChevronLeft className="rtl:-scale-x-100" size={18} aria-hidden />
                </button>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif text-base leading-tight text-ink sm:text-lg">
                    {openThread?.with ?? t('chat.conversation')}
                  </h3>
                  {openThread ? (
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
                      <p className="min-w-0 truncate text-xs text-ink-soft">{openThread.title}</p>
                      {!openThread.last_message ? <EnteredBy record={openThread} /> : null}
                      <Chip className={engagementStatusMeta(openThread.status).className}>
                        {engagementStatusMeta(openThread.status).label}
                      </Chip>
                    </div>
                  ) : (
                    <p className="aqua-skel mt-1 h-3 w-32 rounded" aria-hidden />
                  )}
                </div>
              </div>

              {convErr ? (
                <div
                  role="alert"
                  className="mx-3 mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink sm:mx-4"
                >
                  <p>{convErr}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setConvErr('')
                      setConvReady(false)
                      setConvRetry((n) => n + 1)
                    }}
                    className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
                  >
                    {t('common.retry')}
                  </button>
                </div>
              ) : null}

              <div
                ref={logRef}
                role="log"
                aria-live="polite"
                aria-busy={!convReady}
                aria-label={t('chat.conversation')}
                onScroll={onLogScroll}
                className="page-scroll min-h-0 flex-1 px-3 py-3 sm:px-4"
              >
                {!convReady && !convErr ? (
                  <ConversationSkeleton />
                ) : convErr ? null : lines.length === 0 ? (
                  <p className="py-8 text-center text-sm text-ink-soft">
                    {t('messages.sayHello')}
                  </p>
                ) : (
                  <ConversationLog lines={lines} />
                )}
              </div>

              {convErr ? null : (
              <form
                onSubmit={onComposerSubmit}
                className="shrink-0 border-t border-line px-3 py-3 sm:px-4"
              >
                {sendErr ? (
                  <div
                    role="alert"
                    className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-card border border-hanko/30 bg-hanko/10 px-3 py-2 text-sm text-ink"
                  >
                    <p className="min-w-0 flex-1">{sendErr}</p>
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={sending}
                      className="rounded-full bg-forest-deep px-3 py-1 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {t('common.retry')}
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <label htmlFor={areaId} className="sr-only">
                    {t('messages.write')}
                  </label>
                  <textarea
                    id={areaId}
                    ref={areaRef}
                    rows={1}
                    maxLength={BODY_MAX}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onComposerKey}
                    disabled={sending}
                    placeholder={t('messages.write')}
                    className="max-h-[7.5rem] min-h-10 min-w-0 flex-1 resize-none rounded-2xl border border-line bg-white px-3 py-2 text-base text-ink placeholder:text-ink-soft disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={!canSend}
                    aria-label={t('common.send')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-deep text-cream disabled:opacity-40"
                  >
                    <ArrowUp size={16} aria-hidden />
                  </button>
                </div>
                {showCounter ? (
                  <p className="mt-1 text-end text-[11px] text-ink-soft">
                    {formatInt(draft.length)} / {formatInt(BODY_MAX)}
                  </p>
                ) : null}
              </form>
              )}
            </>
          )}
        </div>
      </div>
    </PageFrame>
  )
}

function ThreadRow({
  thread,
  active,
  onOpen,
}: {
  thread: MessageThread
  active: boolean
  onOpen: () => void
}) {
  const status = engagementStatusMeta(thread.status)
  const unread = thread.unread > 0
  const preview = thread.last_message?.trim() || t('messages.noMessages')
  const unreadLabel =
    countLabel('messages.unread', thread.unread)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      aria-label={
        unread
          ? `${thread.with}, ${thread.title}, ${unreadLabel}`
          : `${thread.with}, ${thread.title}`
      }
      className={`flex w-full min-w-0 items-start gap-2.5 px-3 py-2.5 text-start ${
        active ? 'bg-cream' : 'hover:bg-cream/70'
      }`}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-medium text-white"
        aria-hidden
      >
        {initials(thread.with)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <p className={`min-w-0 truncate text-sm text-ink ${unread ? 'font-medium' : ''}`}>
            {thread.with}
          </p>
          <p className="shrink-0 text-[11px] text-ink-soft">{threadWhen(thread.last_at)}</p>
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1">
          <p className="min-w-0 truncate text-xs text-ink-soft">{thread.title}</p>
          <Chip className={status.className}>{status.label}</Chip>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-ink-soft">{preview}</p>
          
          {unread ? (
            <span className="min-w-4 shrink-0 rounded-full bg-hanko px-1 text-center text-[10px] leading-4 text-white">
              {thread.unread > 9 ? '9+' : formatInt(thread.unread)}
              <span className="sr-only"> {unreadLabel}</span>
            </span>
          ) : null}
        </div>
        {thread.last_message ? <EnteredBy record={thread} /> : null}
      </div>
    </button>
  )
}

function ConversationLog({ lines }: { lines: EngagementMessage[] }) {
  return (
    <div className="space-y-3">
      {lines.map((m, i) => {
        const prev = i > 0 ? lines[i - 1] : undefined
        const showDay =
          !prev || messageDayKey(m.created_at) !== messageDayKey(prev.created_at)
        return (
          <div key={m.id}>
            {showDay ? (
              <p className="py-2 text-center text-[11px] font-medium tracking-wide text-ink-soft uppercase">
                {messageDayLabel(m.created_at)}
              </p>
            ) : null}
            <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] min-w-0">
                <div
                  className={
                    m.mine
                      ? 'rounded-2xl rounded-ee-md bg-forest-deep px-3 py-2 text-sm whitespace-pre-wrap break-words text-cream'
                      : 'rounded-2xl rounded-es-md border border-line bg-paper px-3 py-2 text-sm whitespace-pre-wrap break-words text-ink'
                  }
                >
                  {m.body}
                </div>
                <div className={m.mine ? 'mt-0.5 px-1 text-end' : 'mt-0.5 px-1'}>
                  <EnteredBy record={m} />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ThreadListSkeleton() {
  return (
    <ul className="space-y-0" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="flex items-start gap-2.5 border-b border-line px-3 py-2.5">
          <div className="aqua-skel h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="aqua-skel h-4 w-2/3 rounded" />
            <div className="aqua-skel h-3 w-1/2 rounded" />
            <div className="aqua-skel h-3 w-full rounded" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function ConversationSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="flex justify-start">
        <div className="aqua-skel h-12 w-2/3 rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <div className="aqua-skel h-10 w-1/2 rounded-2xl" />
      </div>
      <div className="flex justify-start">
        <div className="aqua-skel h-16 w-3/4 rounded-2xl" />
      </div>
      <div className="flex justify-end">
        <div className="aqua-skel h-10 w-2/5 rounded-2xl" />
      </div>
    </div>
  )
}
