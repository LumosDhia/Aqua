import { t } from '../../i18n'
import {
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react'
import { Check, FileUp, Leaf, PenLine, Sparkles } from 'lucide-react'
import {
  ApiError,
  api,
  isAbortError,
  type CvData,
  type CvProposal,
  type CvSource,
} from '../../api'
import { formatInt } from '../../lib/status'
import { Portrait } from '../Portrait'
import { CvEditor } from './CvEditor'
import { CvFilePicker } from './CvFilePicker'
import {
  CV_DESCRIBE_MAX,
  CV_DESCRIBE_MIN,
  CV_FIX_MAX,
  CV_FIX_MIN,
  emptyCv,
  normalizeCv,
} from './model'

type Path = 'upload' | 'describe' | 'form'
type Screen = 'choose' | 'upload' | 'describe' | 'form' | 'review'

type StepDef = { id: string; name: string; title: string }

const CHOOSE_STEP: StepDef = { id: 'choose', get name() { return t('common.choose') }, get title() { return t('cv.title') } }

function stepsFor(path: Path | null): StepDef[] {
  if (path === 'upload') {
    return [
      CHOOSE_STEP,
      { id: 'upload', name: t('common.upload'), title: t('cv.upload') },
      { id: 'review', name: t('common.review'), title: t('cv.check') },
    ]
  }
  if (path === 'describe') {
    return [
      CHOOSE_STEP,
      { id: 'describe', name: t('cv.describeShort'), title: t('cv.describe') },
      { id: 'review', name: t('common.review'), title: t('cv.check') },
    ]
  }
  if (path === 'form') {
    return [CHOOSE_STEP, { id: 'form', name: t('cv.form'), title: t('cv.manual') }]
  }
  return [CHOOSE_STEP]
}

export type CvMeta = {
  step: number
  total: number
  title: string
  helper: string
  picture: 'choice' | 'review'
  nextLabel: string
  nextDisabled: boolean
  nextReason: string
  busy: boolean
  busyLabel: string
  canBack: boolean
  hideNext: boolean
  showStartOver: boolean
}

export type CvDoneSummary = {
  jobs: number
  skills: number
  languages: number
}

export type CvFlowHandle = {
  next: () => void
  back: () => void
  startOver: () => void
}

type CvFlowProps = {
  onDone: () => void
  onSkip?: () => void
  onStepChange?: (step: number) => void
  onBusyChange?: (busy: boolean) => void
  defaultName?: string
  photo?: string | null
  layout?: 'card' | 'journey'
  onMeta?: (meta: CvMeta) => void
  onSaved?: (summary: CvDoneSummary) => void
  ref?: Ref<CvFlowHandle>
}

export function CvFlow({
  onDone,
  onSkip,
  onStepChange,
  onBusyChange,
  defaultName = '',
  photo = null,
  layout = 'card',
  onMeta,
  onSaved,
  ref,
}: CvFlowProps) {
  const titleId = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [screen, setScreen] = useState<Screen>('choose')
  const [path, setPath] = useState<Path | null>(null)
  const [form, setForm] = useState<CvData>(() => emptyCv(defaultName))
  const [source, setSource] = useState<CvSource>('manual')
  const [understood, setUnderstood] = useState('')
  const [unsure, setUnsure] = useState<string[]>([])
  const [changes, setChanges] = useState('')
  const [describe, setDescribe] = useState('')
  const [fix, setFix] = useState('')
  const [fileName, setFileName] = useState('')
  const [err, setErr] = useState('')
  const [aiOff, setAiOff] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [busy, setBusy] = useState(false)

  const steps = stepsFor(path)
  const stepIndex = Math.max(0, steps.findIndex((s) => s.id === screen))
  const current = steps[stepIndex] ?? CHOOSE_STEP
  const locked = busy || aiBusy

  useEffect(() => {
    titleRef.current?.focus()
  }, [screen])

  useEffect(() => {
    onStepChange?.(stepIndex)
  }, [stepIndex, onStepChange])

  useEffect(() => {
    onBusyChange?.(locked)
  }, [locked, onBusyChange])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  function go(next: Screen, nextPath: Path | null = path) {
    setErr('')
    setAiOff(false)
    setPath(nextPath)
    setScreen(next)
  }

  function startOver() {
    abortRef.current?.abort()
    abortRef.current = null
    setAiBusy(false)
    setBusy(false)
    setUnderstood('')
    setUnsure([])
    setChanges('')
    setFix('')
    setDescribe('')
    setFileName('')
    setForm(emptyCv(defaultName))
    setSource('manual')
    go('choose', null)
  }

  function applyProposal(out: CvProposal, nextSource: CvSource) {
    setForm(normalizeCv(out.proposed, defaultName))
    setUnderstood(out.understood)
    setUnsure(out.unsure.filter((s) => s.trim()))
    setChanges(out.changes)
    setSource(nextSource)
    go('review', nextSource === 'uploaded' ? 'upload' : 'describe')
  }

  function onAiFail(error: unknown) {
    if (isAbortError(error)) return
    if (error instanceof ApiError && error.status === 503) {
      setAiOff(true)
      setErr(error.message || t('cv.aiUnavailable'))
      return
    }
    setErr(error instanceof ApiError ? error.message : t('cv.readError'))
  }

  async function ensureAi(): Promise<boolean> {
    try {
      const status = await api.aiStatus()
      if (!status.configured) {
        setAiOff(true)
        setErr(t('cv.aiUnavailable'))
        return false
      }
      return true
    } catch {
      return true
    }
  }

  async function sendFile(file: { name: string; data: string }) {
    setErr('')
    setAiOff(false)
    if (!(await ensureAi())) {
      setFileName(file.name)
      setBusy(true)
      try {
        await api.uploadCvFile(file.name, file.data)
        setFileName(file.name)
      } catch (error) {
        setErr(error instanceof ApiError ? error.message : t('cv.file.uploadError'))
      } finally {
        setBusy(false)
      }
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setAiBusy(true)
    setFileName(file.name)
    try {
      await api.uploadCvFile(file.name, file.data)
      const out = await api.parseCv(undefined, ac.signal)
      applyProposal(out, 'uploaded')
    } catch (error) {
      onAiFail(error)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setAiBusy(false)
    }
  }

  async function sendDescribe() {
    const text = describe.trim()
    if (text.length < CV_DESCRIBE_MIN) {
      setErr(t('common.charactersMinimum', { minimum: formatInt(CV_DESCRIBE_MIN) }))
      return
    }
    if (text.length > CV_DESCRIBE_MAX) {
      setErr(t('common.charactersMaximum', { maximum: formatInt(CV_DESCRIBE_MAX) }))
      return
    }
    setErr('')
    setAiOff(false)
    if (!(await ensureAi())) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setAiBusy(true)
    try {
      const out = await api.describeCv(text, ac.signal)
      applyProposal(out, 'described')
    } catch (error) {
      onAiFail(error)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setAiBusy(false)
    }
  }

  async function sendFix() {
    const instruction = fix.trim()
    if (instruction.length < CV_FIX_MIN) {
      setErr(t('common.charactersMinimum', { minimum: formatInt(CV_FIX_MIN) }))
      return
    }
    if (instruction.length > CV_FIX_MAX) {
      setErr(t('common.charactersMaximum', { maximum: formatInt(CV_FIX_MAX) }))
      return
    }
    setErr('')
    setAiOff(false)
    if (!(await ensureAi())) return
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setAiBusy(true)
    try {
      const out = await api.refineCv(form, instruction, ac.signal)
      setForm(normalizeCv(out.proposed, defaultName))
      setUnderstood(out.understood)
      setUnsure(out.unsure.filter((s) => s.trim()))
      setChanges(out.changes)
      setFix('')
    } catch (error) {
      onAiFail(error)
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setAiBusy(false)
    }
  }

  async function save(nextSource: CvSource) {
    setBusy(true)
    setErr('')
    try {
      await api.saveCv(form, nextSource)
      try {
        await api.applyCvToProfile()
      } catch {
        /* profile fill is optional after a successful save */
      }
      const summary: CvDoneSummary = {
        jobs: form.experience.filter((row) => row.role.trim() || row.employer.trim()).length,
        skills: form.skills.length,
        languages: form.languages.length,
      }
      if (onSaved) onSaved(summary)
      else onDone()
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('cv.saveError'))
    } finally {
      setBusy(false)
    }
  }

  function cancelAi() {
    abortRef.current?.abort()
    abortRef.current = null
    setAiBusy(false)
  }

  function onCardKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Enter' || locked) return
    const t = e.target
    if (!(t instanceof HTMLElement)) return
    if (
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'BUTTON' ||
      t.tagName === 'A' ||
      t.tagName === 'SELECT'
    ) {
      return
    }
    if (t instanceof HTMLInputElement && t.type === 'file') return
    if (screen === 'describe') {
      e.preventDefault()
      void sendDescribe()
    }
  }

  function goBack() {
    if (screen === 'review') go(path === 'describe' ? 'describe' : 'upload', path)
    else if (screen === 'choose') return
    else go('choose', null)
  }

  function runPrimary() {
    if (screen === 'describe') void sendDescribe()
    else if (screen === 'form') void save('manual')
    else if (screen === 'review') void save(source)
  }

  useImperativeHandle(ref, () => ({
    next: runPrimary,
    back: goBack,
    startOver,
  }))

  const helperOf: Record<Screen, string> = {
    choose: t('cv.choices'),
    upload: t('cv.file.formatsComma'),
    describe: t('cv.describeHelp'),
    form: t('cv.manualHelp'),
    review: t('cv.reviewHelp'),
  }
  const hideNext = screen === 'choose' || screen === 'upload' || aiBusy
  const nextLabel =
    screen === 'describe'
      ? t('cv.create')
      : screen === 'form'
        ? busy
          ? t('common.saving')
          : t('cv.save')
        : screen === 'review'
          ? busy
            ? t('common.saving')
            : t('cv.confirm')
          : t('common.next')

  useLayoutEffect(() => {
    onMeta?.({
      step: stepIndex,
      total: steps.length,
      title: current.title,
      helper: helperOf[screen],
      picture: screen === 'review' ? 'review' : 'choice',
      nextLabel,
      nextDisabled: locked,
      nextReason: aiBusy ? t('cv.reading') : '',
      busy,
      busyLabel: t('common.saving'),
      canBack: screen !== 'choose' && !locked,
      hideNext,
      showStartOver: screen === 'review' && !aiBusy,
    })
  }, [
    onMeta,
    stepIndex,
    steps.length,
    current.title,
    screen,
    nextLabel,
    locked,
    aiBusy,
    busy,
    hideNext,
  ])

  return (
    <article
      data-card={layout === 'card' ? '' : undefined}
      aria-labelledby={layout === 'card' ? titleId : undefined}
      onKeyDown={onCardKey}
      className={
        layout === 'card'
          ? 'relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell'
          : undefined
      }
    >
      {layout === 'card' ? (
        <>
      <Leaf
        size={64}
        aria-hidden
        className="pointer-events-none absolute top-3 end-4 rotate-12 text-leaf opacity-30"
      />
      <Leaf
        size={40}
        aria-hidden
        className="pointer-events-none absolute bottom-16 start-3 -rotate-12 text-leaf opacity-20"
      />

      <header className="relative shrink-0 border-b border-line px-4 py-3 sm:px-6">
        <nav aria-label={t('cv.steps')}>
          <ol className="flex flex-wrap items-center gap-1">
            {steps.map((s, i) => {
              const done = i < stepIndex
              const here = i === stepIndex
              return (
                <li key={s.id} className="flex min-w-0 items-center gap-1">
                  {i > 0 ? (
                    <span aria-hidden className="mx-0.5 text-mute">
                      ·
                    </span>
                  ) : null}
                  <span
                    aria-current={here ? 'step' : undefined}
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs ${
                      here
                        ? 'bg-forest-deep font-medium text-white'
                        : done
                          ? 'text-forest'
                          : 'text-ink-soft'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 items-center justify-center rounded-full ${
                        here ? 'bg-white/20' : done ? 'bg-leaf-soft' : 'bg-cream'
                      }`}
                    >
                      {done ? <Check size={10} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={here ? '' : 'hidden sm:inline'}>{s.name}</span>
                  </span>
                </li>
              )
            })}
          </ol>
        </nav>
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="mt-2 font-serif text-xl leading-tight text-ink sm:text-2xl"
        >
          {current.title}
        </h2>
      </header>
        </>
      ) : null}

      <div
        className={
          layout === 'card' ? 'page-scroll relative min-h-0 flex-1 px-4 py-3 sm:px-6' : undefined
        }
      >
        <div key={layout === 'card' ? screen : undefined} className={layout === 'card' ? 'onboard-step' : undefined}>
          {aiBusy ? (
            <ReadingState onCancel={cancelAi} />
          ) : (
            <>
              {screen === 'choose' ? (
                <Choose
                  onUpload={() => go('upload', 'upload')}
                  onForm={() => {
                    setForm(emptyCv(defaultName))
                    setSource('manual')
                    go('form', 'form')
                  }}
                  onDescribe={() => go('describe', 'describe')}
                  onSkip={layout === 'card' ? onSkip : undefined}
                />
              ) : null}
              {screen === 'upload' ? (
                <div className="space-y-3">
                  <CvFilePicker
                    disabled={locked}
                    onFile={(file) => void sendFile(file)}
                    onError={setErr}
                  />
                  {fileName ? (
                    <p className="text-xs text-ink-soft">{t('cv.lastFile')}{' '} {fileName}</p>
                  ) : null}
                  {aiOff ? <AiOffNote onForm={() => go('form', 'form')} /> : null}
                </div>
              ) : null}
              {screen === 'describe' ? (
                <div className="space-y-3">
                  <DescribeStep
                    value={describe}
                    disabled={locked}
                    onChange={(v) => {
                      setDescribe(v)
                      setErr('')
                    }}
                  />
                  {aiOff ? <AiOffNote onForm={() => go('form', 'form')} /> : null}
                </div>
              ) : null}
              {screen === 'form' ? (
                <CvEditor value={form} onChange={setForm} disabled={locked} />
              ) : null}
              {screen === 'review' ? (
                <ReviewStep
                  understood={understood}
                  unsure={unsure}
                  changes={changes}
                  form={form}
                  photo={photo}
                  name={defaultName}
                  fix={fix}
                  disabled={locked}
                  aiOff={aiOff}
                  onForm={setForm}
                  onFix={setFix}
                  onSendFix={() => void sendFix()}
                  onFillForm={() => go('form', 'form')}
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      {err ? (
        <p
          className={
            layout === 'card'
              ? 'relative shrink-0 px-4 pb-1 text-sm text-hanko sm:px-6'
              : 'mt-3 text-sm text-hanko'
          }
          role="alert"
        >
          {err}
        </p>
      ) : null}

      {layout === 'card' ? (
      <footer className="relative flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => {
            if (screen === 'review') go(path === 'describe' ? 'describe' : 'upload', path)
            else if (screen === 'choose') return
            else go('choose', null)
          }}
          disabled={screen === 'choose' || locked}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
        >
          {t('common.back')}
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {screen === 'describe' ? (
            <button
              type="button"
              onClick={() => void sendDescribe()}
              disabled={locked}
              className="rounded-full bg-forest-deep px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {t('cv.create')}
            </button>
          ) : null}
          {screen === 'form' ? (
            <button
              type="button"
              onClick={() => void save('manual')}
              disabled={locked}
              className="rounded-full bg-forest-deep px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? t('common.saving') : t('cv.save')}
            </button>
          ) : null}
          {screen === 'review' ? (
            <>
              <button
                type="button"
                onClick={startOver}
                disabled={locked}
                className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
              >
                {t('cv.restart')}
              </button>
              <button
                type="button"
                onClick={() => void save(source)}
                disabled={locked}
                className="rounded-full bg-forest-deep px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? t('common.saving') : t('cv.confirm')}
              </button>
            </>
          ) : null}
        </div>
      </footer>
      ) : null}
    </article>
  )
}

function Choose({
  onUpload,
  onForm,
  onDescribe,
  onSkip,
}: {
  onUpload: () => void
  onForm: () => void
  onDescribe: () => void
  onSkip?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ChoiceCard
          icon={FileUp}
          title={t('cv.upload')}
          help={t('cv.file.limitHint')}
          onSelect={onUpload}
        />
        <ChoiceCard
          icon={PenLine}
          title={t('cv.manualSelf')}
          help={t('cv.formHint')}
          onSelect={onForm}
        />
        <ChoiceCard
          icon={Sparkles}
          title={t('cv.describe')}
          help={t('cv.describeAuto')}
          onSelect={onDescribe}
        />
      </div>
      {onSkip ? (
        <p className="text-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-ink-soft hover:text-forest hover:underline"
          >
            {t('common.skipForNow')}
          </button>
        </p>
      ) : null}
    </div>
  )
}

function ChoiceCard({
  icon: Icon,
  title,
  help,
  onSelect,
}: {
  icon: typeof FileUp
  title: string
  help: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-card=""
      className="rounded-card border border-line bg-white px-4 py-3 text-start hover:bg-cream"
    >
      <span className="flex items-center gap-2 font-serif text-lg text-ink">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-cream text-forest"
        >
          <Icon size={18} />
        </span>
        {title}
      </span>
      <span className="mt-1 block text-xs text-ink-soft">{help}</span>
    </button>
  )
}

function DescribeStep({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium text-ink-soft">
        {t('cv.whatYouKnow')}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, CV_DESCRIBE_MAX))}
        maxLength={CV_DESCRIBE_MAX}
        disabled={disabled}
        dir="auto"
        rows={8}
        placeholder={t('cv.describeWork')}
        className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
      />
      <p className="mt-1 text-end text-xs text-ink-soft">
        {formatInt(value.length)}/{formatInt(CV_DESCRIBE_MAX)}
      </p>
    </div>
  )
}

function ReviewStep({
  understood,
  unsure,
  changes,
  form,
  photo,
  name,
  fix,
  disabled,
  aiOff,
  onForm,
  onFix,
  onSendFix,
  onFillForm,
}: {
  understood: string
  unsure: string[]
  changes: string
  form: CvData
  photo: string | null
  name: string
  fix: string
  disabled: boolean
  aiOff: boolean
  onForm: (next: CvData) => void
  onFix: (value: string) => void
  onSendFix: () => void
  onFillForm: () => void
}) {
  const fixId = useId()
  const who = form.full_name.trim() || name.trim() || t('shell.cv')
  return (
    <div className="space-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <Portrait name={who} photo={photo} size="md" />
        <p className="min-w-0 truncate font-serif text-lg leading-tight text-ink">{who}</p>
      </div>
      {understood.trim() ? (
        <section
          data-card=""
          className="rounded-card border border-leaf/40 bg-leaf-soft/50 p-3 sm:p-4"
        >
          <h3 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
            {t('cv.understood')}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-sm break-words text-ink">{understood}</p>
        </section>
      ) : null}
      {unsure.length > 0 ? (
        <section data-card="" className="rounded-card border border-ochre/40 bg-ochre-soft/40 p-3 sm:p-4">
          <h3 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
            {t('cv.unsure')}
          </h3>
          <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink">
            {unsure.map((item, i) => (
              <li key={`${item}-${i}`}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {changes.trim() ? (
        <p className="text-sm text-forest" role="status">
          {t('cv.changed')}{' '} {changes}
        </p>
      ) : null}
      <CvEditor value={form} onChange={onForm} disabled={disabled} />
      <div data-card="" className="rounded-card border border-line bg-cream p-3 sm:p-4">
        <label htmlFor={fixId} className="text-xs font-medium text-ink-soft">
          {t('cv.askFix')}
        </label>
        <textarea
          id={fixId}
          value={fix}
          onChange={(e) => onFix(e.target.value.slice(0, CV_FIX_MAX))}
          maxLength={CV_FIX_MAX}
          disabled={disabled}
          dir="auto"
          rows={3}
          className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-soft">
            {formatInt(fix.length)}/{formatInt(CV_FIX_MAX)}
          </p>
          <button
            type="button"
            onClick={onSendFix}
            disabled={disabled}
            className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {t('cv.fix')}
          </button>
        </div>
      </div>
      {aiOff ? <AiOffNote onForm={onFillForm} /> : null}
    </div>
  )
}

function ReadingState({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center px-4 py-10 text-center">
      <span
        className="aqua-spin"
        style={{ width: '1.75rem', height: '1.75rem' }}
        aria-hidden
      />
      <p className="mt-4 text-sm text-ink" role="status" aria-live="polite">
        {t('cv.readingWait')}
      </p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 rounded-full border border-line px-4 py-2 text-sm"
      >
        {t('common.cancel')}
      </button>
    </div>
  )
}

function AiOffNote({ onForm }: { onForm: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ochre/40 bg-ochre-soft/40 px-4 py-3 text-sm text-ink"
    >
      <p>{t('cv.aiUnavailable')}</p>
      <button
        type="button"
        onClick={onForm}
        className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
      >
        {t('cv.manualSelf')}
      </button>
    </div>
  )
}
