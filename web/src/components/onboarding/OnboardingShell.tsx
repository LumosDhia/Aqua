import { t } from '../../i18n'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { ArrowRight, Leaf, LoaderCircle } from 'lucide-react'
import { Hanko, Logo } from '../Logo'
import type { JourneyPicture } from './journey'

export type OnboardingShellProps = {
  step: number
  total: number
  title: string
  helper: string
  picture: JourneyPicture
  preloadSrc?: string
  greeting?: string | null
  accountExists: boolean
  onLogout?: () => void
  onSkip?: () => void
  skipDisabled?: boolean
  onLogin?: () => void
  nextLabel: string
  nextHint?: 'arrow' | 'leaf'
  nextDisabled?: boolean
  nextReason?: string
  nextBusy?: boolean
  busyLabel?: string
  onNext?: () => void
  submitForm?: boolean
  hideNext?: boolean
  onBack?: () => void
  backDisabled?: boolean
  hideBack?: boolean
  hideFooter?: boolean
  extras?: ReactNode
  children: ReactNode
}

type PhotoLayer = {
  picture: JourneyPicture
  id: number
}

export function OnboardingShell({
  step,
  total,
  title,
  helper,
  picture,
  preloadSrc,
  greeting,
  accountExists,
  onLogout,
  onSkip,
  skipDisabled = false,
  onLogin,
  nextLabel,
  nextHint = 'arrow',
  nextDisabled = false,
  nextReason,
  nextBusy = false,
  busyLabel,
  onNext,
  submitForm = false,
  hideNext = false,
  onBack,
  backDisabled = false,
  hideBack = false,
  hideFooter = false,
  extras,
  children,
}: OnboardingShellProps) {
  const titleId = useId()
  const formId = useId()
  const contentRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const layerId = useRef(0)
  const [current, setCurrent] = useState<PhotoLayer>({ picture, id: 0 })
  const currentRef = useRef(current)
  currentRef.current = current
  const [leaving, setLeaving] = useState<PhotoLayer | null>(null)
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const from = currentRef.current
    if (picture.src === from.picture.src && picture.kicker === from.picture.kicker) {
      setCurrent((c) => ({ ...c, picture }))
      return
    }
    layerId.current += 1
    if (!reduced) setLeaving(from)
    else setLeaving(null)
    setCurrent({ picture, id: layerId.current })
  }, [picture, reduced])

  useEffect(() => {
    if (leaving === null) return
    const t = window.setTimeout(() => setLeaving(null), reduced ? 0 : 900)
    return () => window.clearTimeout(t)
  }, [leaving, reduced])

  useEffect(() => {
    if (!preloadSrc) return
    const img = new Image()
    img.src = preloadSrc
  }, [preloadSrc])

  useEffect(() => {
    contentRef.current?.scrollTo(0, 0)
    titleRef.current?.focus({ preventScroll: true })
  }, [step, title])

  function onPanelKey(e: KeyboardEvent<HTMLElement>) {
    if (e.defaultPrevented || e.nativeEvent.isComposing || e.key !== 'Enter' || nextBusy || nextDisabled || hideNext || hideFooter || !onNext) return
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
    if (t instanceof HTMLInputElement && (submitForm || t.type === 'file')) return
    e.preventDefault()
    const form = submitForm ? document.getElementById(formId) : null
    if (form instanceof HTMLFormElement) form.requestSubmit()
    else onNext()
  }

  const skipTitle = skipDisabled ? t('common.waitPlain') : undefined
  const pct = total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0
  const kenburns = reduced ? '' : 'journey-kenburns'

  return (
    <div className="onboard-page journey-page relative flex h-dvh max-h-dvh flex-col overflow-hidden">
      <a className="skip-link" href="#onboard-main">
        {t('onboarding.skipSetup')}
      </a>
      <Decor />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col min-[900px]:p-6">
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden overflow-x-hidden bg-paper shadow-shell min-[900px]:rounded-[1.6rem]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto min-[900px]:h-full min-[900px]:flex-row min-[900px]:overflow-hidden">
            <aside className="relative h-[min(22dvh,9rem)] shrink-0 overflow-hidden min-[900px]:h-auto min-[900px]:w-[45%] min-[900px]:flex-none min-[900px]:self-stretch">
              {leaving && !reduced ? (
                <div key={leaving.id} className={`absolute inset-0 ${kenburns}`}>
                  <img
                    src={leaving.picture.src}
                    alt=""
                    aria-hidden
                    className="journey-photo-out h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div key={current.id} className={`absolute inset-0 z-[1] ${kenburns}`}>
                <img
                  src={current.picture.src}
                  alt={current.picture.alt}
                  decoding="async"
                  className={`h-full w-full object-cover ${
                    reduced || current.id === 0 ? 'opacity-100' : 'journey-photo-in'
                  }`}
                />
              </div>
              <div className="bg-photo-scrim pointer-events-none absolute inset-0 z-[2]" />
              <div className="absolute top-3 start-3 z-10 flex items-center gap-2 min-[900px]:top-5 min-[900px]:left-5">
                <Logo size={32} className="text-white" title="Aqua" />
                <span className="font-serif text-base font-semibold tracking-wide text-white">
                  Aqua
                </span>
                <Hanko size={20} />
              </div>
              <div aria-hidden className="absolute inset-x-0 top-0 z-10 h-0.5 bg-white/25">
                <div
                  className="journey-progress h-full bg-white"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 z-10 p-4 min-[900px]:p-8">
                <p className="font-serif text-xl leading-tight text-white min-[900px]:text-3xl">
                  {current.picture.kicker}
                </p>
                <p className="mt-1 hidden text-sm text-white/85 min-[900px]:block">
                  {current.picture.line}
                </p>
              </div>
            </aside>

            <section
              className="relative flex min-h-[22rem] min-w-0 flex-1 flex-col bg-paper min-[900px]:min-h-0 min-[900px]:w-[55%] min-[900px]:flex-none"
              onKeyDown={onPanelKey}
            >
              <div className="flex shrink-0 items-center justify-end gap-2 px-4 pt-3 sm:px-6 min-[900px]:px-8 min-[900px]:pt-5">
                {accountExists ? (
                  <>
                    {onSkip ? (
                      <button
                        type="button"
                        onClick={onSkip}
                        disabled={skipDisabled}
                        title={skipTitle}
                        className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-forest disabled:opacity-60"
                      >
                        {t('common.skipForNow')}
                      </button>
                    ) : null}
                    {onLogout ? (
                      <button
                        type="button"
                        onClick={onLogout}
                        disabled={skipDisabled}
                        className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-forest"
                      >
                        {t('shell.logout')}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <a
                    href="#/"
                    onClick={(e) => {
                      if (!onLogin) return
                      e.preventDefault()
                      onLogin()
                    }}
                    className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-forest"
                  >
                    {t('login.submit')}
                  </a>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6 min-[900px]:px-8">
                <div className="shrink-0 pt-2 pb-3 min-[900px]:pt-1">
                  <div
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={total}
                    aria-valuenow={step}
                    aria-label={t('onboarding.progress')}
                    className="h-1 overflow-hidden rounded-full bg-leaf-soft/70"
                  >
                    <div
                      className="journey-progress h-full rounded-full bg-leaf"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[11px] font-medium tracking-[0.14em] text-ink-soft uppercase">
                    {t('common.paginationStep', { current: step, total })}
                  </p>
                  {greeting ? (
                    <p className="journey-greet mt-2 font-serif text-base text-forest">
                      {t('onboarding.greeting', { name: greeting })}
                    </p>
                  ) : null}
                  <h1
                    id={titleId}
                    ref={titleRef}
                    tabIndex={-1}
                    className="mt-2 font-serif text-[1.85rem] leading-tight text-ink min-[900px]:text-[2.15rem]"
                  >
                    {title}
                  </h1>
                  {helper ? <p className="mt-1 text-sm text-ink-soft">{helper}</p> : null}
                </div>

                <main
                  id="onboard-main"
                  ref={contentRef}
                  tabIndex={-1}
                  aria-labelledby={titleId}
                  className="page-scroll journey-fields relative min-h-0 flex-1 pb-3"
                >
                  <div className="sr-only" aria-live="polite">
                    {title}
                  </div>
                  {submitForm ? (
                    <form
                      id={formId}
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault()
                        if (!nextDisabled && !nextBusy) onNext?.()
                      }}
                    >
                      {children}
                    </form>
                  ) : children}
                </main>
              </div>

              {hideFooter ? null : (
                <footer className="flex shrink-0 flex-col gap-2 border-t border-line px-4 py-3 sm:px-6 min-[900px]:px-8 min-[900px]:py-4">
                  {extras ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">{extras}</div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {hideBack ? (
                      <span />
                    ) : (
                      <button
                        type="button"
                        onClick={onBack}
                        disabled={backDisabled || nextBusy}
                        className="rounded-full px-3 py-2 text-sm text-ink-soft hover:text-forest disabled:opacity-50"
                      >
                        {t('common.back')}
                      </button>
                    )}
                    {hideNext ? (
                      <span />
                    ) : (
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                        {nextDisabled && nextReason ? (
                          <p className="max-w-[14rem] text-end text-xs text-ink-soft">
                            {nextReason}
                          </p>
                        ) : null}
                        <button
                          type={submitForm ? 'submit' : 'button'}
                          form={submitForm ? formId : undefined}
                          onClick={submitForm ? undefined : onNext}
                          disabled={nextDisabled || nextBusy}
                          title={nextDisabled ? nextReason : undefined}
                          className="journey-next group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-forest-deep px-5 max-w-full text-base font-medium text-white disabled:opacity-50 sm:min-w-[10.5rem] sm:px-6"
                        >
                          {nextBusy ? (
                            <>
                              <LoaderCircle
                                size={18}
                                aria-hidden
                                className="animate-spin"
                              />
                              {busyLabel ?? t('common.wait')}
                            </>
                          ) : (
                            <>
                              {nextHint === 'leaf' ? (
                                <Leaf size={18} aria-hidden />
                              ) : null}
                              {nextLabel}
                              {nextHint === 'arrow' ? (
                                <ArrowRight
                                  size={18}
                                  aria-hidden
                                  className="journey-next-icon rtl:-scale-x-100"
                                />
                              ) : null}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </footer>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function Decor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 -end-16 h-[22rem] w-[22rem] rounded-[42%_58%_48%_52%] bg-ochre-soft" />
      <div className="absolute -bottom-28 -start-24 h-[24rem] w-[26rem] rounded-[50%_40%_60%_50%] bg-ochre" />
      <div className="absolute bottom-10 -start-10 h-40 w-40 rounded-full bg-leaf/25 blur-2xl" />
      <div className="absolute top-24 end-[18%] h-16 w-16 rounded-full bg-leaf/20 blur-xl" />
      <svg className="absolute top-10 start-[16%] h-3.5 w-3.5 text-hanko" viewBox="0 0 8 8">
        <polygon points="4,0 8,8 0,8" fill="currentColor" />
      </svg>
      <svg className="absolute top-20 end-[26%] h-3 w-3 text-leaf" viewBox="0 0 8 8">
        <polygon points="4,0 8,8 0,8" fill="currentColor" />
      </svg>
      <svg className="absolute bottom-28 start-[28%] h-3 w-3 text-ochre" viewBox="0 0 8 8">
        <polygon points="4,8 8,0 0,0" fill="currentColor" />
      </svg>
      <div className="absolute bottom-[32%] start-[7%] h-16 w-16 rounded-full border-2 border-leaf/35" />
      <div className="absolute top-[38%] end-[10%] h-9 w-9 rounded-full border border-ochre/50" />
      <div className="absolute top-[22%] start-[8%] h-2.5 w-2.5 rotate-45 bg-leaf" />
      <div className="absolute end-[30%] bottom-16 h-3 w-3 rotate-45 bg-ochre" />
      <div className="absolute bottom-[14%] start-[32%] h-2.5 w-2.5 rotate-45 bg-hanko" />
      <div className="absolute top-12 start-[42%] h-2 w-2 rounded-full bg-ochre" />
    </div>
  )
}
