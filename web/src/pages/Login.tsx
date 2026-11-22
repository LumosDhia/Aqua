import { t } from '../i18n'
import { Trans } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api, setToken, type User } from '../api'
import { Hanko, Logo } from '../components/Logo'
import { SIGNUP_HREF } from '../lib/view'

type Slide = { src: string; alt: string; caption: string }
type Layer = { index: number; id: number }

const SLIDE_MS = 20_000
const FADE_MS = 2_000

const SLIDES: Slide[] = [
  {
    src: '/img/login/tn-olive-testour.jpg',
    get alt() { return t('login.slides.testourAlt') },
    get caption() { return t('login.slides.testour') },
  },
  {
    src: '/img/login/jp-shizuoka-tea.jpg',
    get alt() { return t('login.slides.shizuokaAlt') },
    get caption() { return t('login.slides.shizuoka') },
  },
  {
    src: '/img/login/tn-achref-olive.jpg',
    get alt() { return t('login.slides.achrefAlt') },
    get caption() { return t('login.slides.achref') },
  },
  {
    src: '/img/login/jp-farmer-terrace.jpg',
    get alt() { return t('login.slides.niigataAlt') },
    get caption() { return t('login.slides.niigata') },
  },
  {
    src: '/img/login/tn-tozeur-oasis.jpg',
    get alt() { return t('login.slides.tozeurAlt') },
    get caption() { return t('login.slides.tozeur') },
  },
  {
    src: '/img/login/jp-futago-terrace.jpg',
    get alt() { return t('login.slides.futagoAlt') },
    get caption() { return t('login.slides.futago') },
  },
  {
    src: '/img/login/tn-cap-bon-olive.jpg',
    get alt() { return t('login.slides.capBonAlt') },
    get caption() { return t('login.slides.capBon') },
  },
  {
    src: '/img/login/jp-nishigaoka-terrace.jpg',
    get alt() { return t('login.slides.nishigaokaAlt') },
    get caption() { return t('login.slides.nishigaoka') },
  },
  {
    src: '/img/login/tn-olive-dahar.jpg',
    get alt() { return t('login.slides.daharAlt') },
    get caption() { return t('login.slides.dahar') },
  },
  {
    src: '/img/login/jp-tsuzura-terrace.jpg',
    get alt() { return t('login.slides.tsuzuraAlt') },
    get caption() { return t('login.slides.tsuzura') },
  },
]

const CREDIT_LINES = [
  'Olive tree Testour.jpg by Smailtn, CC0.',
  'Inside Tozeur Oasis 04.jpg by Houss 2020, CC0.',
  'The olive-tree in Achref.jpg by Malek Sayadi, CC BY-SA 4.0.',
  'Tea-plantation Shizuoka-Fukuroi.jpg by MaedaAkihiko, CC BY-SA 4.0.',
  'Cap Bon olive groves, CC BY-SA 4.0.',
  'Oliveraie - Dahar, CC BY-SA 4.0.',
  'Yamaguchi-Farmer in Higashi-ushirobata Rice Terrace, CC BY 4.0.',
  'Fukuoka-Tsuzura Rice Terrace in an Early Summer, CC BY 4.0.',
  'Hyogo-Nishigaoka rice terraces, CC BY 4.0.',
  'Futago Tanada in Kamogawa, Chiba, CC BY 2.0.',
] as const

type Field = 'email' | 'password' | null

type LoginProps = {
  onDone: (user: User) => void
}

export function Login({ onDone }: LoginProps) {
  const formId = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [focus, setFocus] = useState<Field>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [current, setCurrent] = useState<Layer>({ index: 0, id: 0 })
  const [leaving, setLeaving] = useState<Layer | null>(null)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [tabHidden, setTabHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden,
  )
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const currentRef = useRef(current)
  currentRef.current = current
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const layerId = useRef(0)
  const holdMotion = tabHidden || creditsOpen

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function go(delta: number) {
    const from = currentRef.current
    const nextIndex = (from.index + delta + SLIDES.length) % SLIDES.length
    if (nextIndex === from.index) return
    layerId.current += 1
    if (!reducedRef.current) setLeaving(from)
    else setLeaving(null)
    setCurrent({ index: nextIndex, id: layerId.current })
  }

  const goRef = useRef(go)
  goRef.current = go

  useEffect(() => {
    const next = new Image()
    next.src = SLIDES[(current.index + 1) % SLIDES.length].src
  }, [current.index])

  useEffect(() => {
    if (leaving === null) return
    const t = window.setTimeout(() => setLeaving(null), reduced ? 0 : FADE_MS)
    return () => window.clearTimeout(t)
  }, [leaving, reduced])

  useEffect(() => {
    let timeout: number | undefined
    let remaining = SLIDE_MS
    let startedAt = 0

    function arm(ms: number) {
      startedAt = Date.now()
      timeout = window.setTimeout(() => {
        remaining = SLIDE_MS
        goRef.current(1)
      }, ms)
    }

    function clear() {
      if (timeout === undefined) return
      window.clearTimeout(timeout)
      timeout = undefined
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
    }

    function onVis() {
      const hidden = document.hidden
      setTabHidden(hidden)
      if (hidden) clear()
      else if (!creditsOpen) arm(remaining)
    }

    if (!document.hidden && !creditsOpen) arm(remaining)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [current.id, creditsOpen])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setErr('')
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setErr(t('login.required'))
      return
    }
    setBusy(true)
    try {
      const res = await api.login(trimmedEmail, password)
      setToken(res.access_token, remember)
      onDone(res.user)
    } catch (error) {
      if (error instanceof ApiError) setErr(error.message)
      else setErr(t('common.tryLater'))
    } finally {
      setBusy(false)
    }
  }

  const kenburns = reduced ? '' : `login-kenburns${holdMotion ? ' login-kenburns-paused' : ''}`

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      <a className="skip-link" href={`#${formId}`}>
        {t('login.skipForm')}
      </a>
      <Decor />

      <div className="relative z-10 w-full max-w-[980px] overflow-hidden rounded-[1.6rem] bg-white shadow-shell">
        <div className="grid md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section
            className="relative flex flex-col px-8 py-10 sm:px-12 sm:py-12"
          >
            <div className="mb-10 flex flex-wrap items-center gap-2.5">
              <a
                href="./home/index.html"
                aria-label={t('login.aquaHome')}
                className="flex items-center gap-2 text-forest hover:text-forest-mid"
              >
                <Logo size={36} className="text-current" />
                <span className="font-serif text-lg font-semibold tracking-wide">Aqua</span>
              </a>
              <Hanko size={22} />
              <div className="ms-auto"><LanguageSwitcher /></div>
            </div>

            <h1 className="font-serif text-[2rem] leading-tight text-ink sm:text-[2.15rem]">
              <Trans i18nKey="login.welcome" components={{ brand: <span className="text-forest" /> }} />
            </h1>
            <p className="mt-2 max-w-xs text-sm text-ink-soft">
              {t('login.welcomeBack')}
            </p>

            <form id={formId} className="mt-8" onSubmit={submit} aria-busy={busy} noValidate>
              <div className="overflow-hidden rounded-lg border border-line bg-white">
                <FieldRow
                  id={`${formId}-email`}
                  label={t('login.email')}
                  type="email"
                  value={email}
                  autoComplete="email"
                  active={focus === 'email'}
                  disabled={busy}
                  onFocus={() => setFocus('email')}
                  onBlur={() => setFocus(null)}
                  onChange={setEmail}
                />
                <FieldRow
                  id={`${formId}-password`}
                  label={t('login.password')}
                  type="password"
                  value={password}
                  autoComplete="current-password"
                  active={focus === 'password'}
                  disabled={busy}
                  last
                  onFocus={() => setFocus('password')}
                  onBlur={() => setFocus(null)}
                  onChange={setPassword}
                />
              </div>

              {err ? (
                <p className="mt-3 text-sm text-hanko" role="alert">
                  {err}
                </p>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <input
                  id={`${formId}-remember`}
                  type="checkbox"
                  className="h-4 w-4 rounded border-line text-forest accent-forest"
                  checked={remember}
                  disabled={busy}
                  onChange={(ev) => setRemember(ev.target.checked)}
                />
                <label htmlFor={`${formId}-remember`} className="text-sm text-ink-soft">
                  {t('login.remember')}
                </label>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-full bg-forest-deep px-6 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? t('common.wait') : t('login.submit')}
                </button>
                <a
                  href={SIGNUP_HREF}
                  className="rounded-full border border-line bg-white px-6 py-2.5 text-sm font-medium text-ink hover:bg-cream"
                >
                  {t('login.signup')}
                </a>
              </div>

              <p className="mt-4 text-sm text-ink-soft">
                {t('login.newHere')}{' '}
                <a href={SIGNUP_HREF} className="font-medium text-forest hover:underline">
                  {t('login.createAccount')}
                </a>
              </p>

              <p className="mt-8 max-w-sm text-xs leading-relaxed text-ink-soft">
                {t('login.privacy')}
              </p>
            </form>
          </section>

          <aside className="relative min-h-56 md:min-h-[560px]">
            <div className="absolute inset-0 overflow-hidden bg-forest-deep md:rounded-e-[1.6rem]">
              {leaving && !reduced ? (
                <div key={leaving.id} className={`absolute inset-0 ${kenburns}`}>
                  <img
                    src={SLIDES[leaving.index].src}
                    alt=""
                    aria-hidden
                    className="login-fade-out h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div key={current.id} className={`absolute inset-0 z-[1] ${kenburns}`}>
                <img
                  src={SLIDES[current.index].src}
                  alt={SLIDES[current.index].alt}
                  decoding="async"
                  className={`h-full w-full object-cover ${
                    reduced || current.id === 0 ? 'opacity-100' : 'login-fade-in'
                  }`}
                />
              </div>
              <div className="absolute inset-0 z-[2] bg-forest-deep/15" />
            </div>

            <div className="absolute left-1/2 top-[42%] z-10 flex h-36 w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border border-white/35 bg-white/20 shadow-shell backdrop-blur-md sm:h-40 sm:w-40">
              <Logo size={88} className="text-forest" title="Aqua" />
              <span
                aria-hidden
                className="absolute end-5 top-6 h-8 w-5 rotate-[-28deg] rounded-[70%_30%_60%_40%] bg-ochre"
              />
            </div>

            <div className="absolute bottom-16 start-5 z-10 grid">
              {leaving && !reduced ? (
                <span
                  key={leaving.id}
                  className="login-fade-out col-start-1 row-start-1 whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-forest backdrop-blur-sm"
                >
                  {SLIDES[leaving.index].caption}
                </span>
              ) : null}
              <span
                key={current.id}
                className={`col-start-1 row-start-1 whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-xs font-medium text-forest backdrop-blur-sm ${
                  reduced || current.id === 0 ? '' : 'login-fade-in'
                }`}
              >
                {SLIDES[current.index].caption}
              </span>
            </div>
            <div className="sr-only" aria-live="polite">
              {SLIDES[current.index].caption}
            </div>

            <button
              type="button"
              onClick={() => setCreditsOpen(true)}
              aria-haspopup="dialog"
              className="absolute bottom-4 start-5 z-10 text-[10px] font-medium tracking-wide text-white/90 underline decoration-white/50 underline-offset-2 hover:text-white"
            >
              {t('login.photoCredits')}
            </button>

            <div
              aria-hidden
              className="absolute top-0 left-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-hanko font-serif text-lg text-white shadow-shell md:top-1/2 md:start-0 rtl:md:translate-x-1/2 md:h-14 md:w-14 md:text-xl"
            >
              水
            </div>
          </aside>
        </div>
      </div>

      <CreditsDialog open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  )
}

function CreditsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const root = panelRef.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pick = () =>
      root
        ? [
            ...root.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ]
        : []
    const first = pick()[0]
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const els = pick()
      if (els.length === 0) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault()
          els[els.length - 1].focus()
        }
      } else if (i === els.length - 1) {
        e.preventDefault()
        els[0].focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest-deep/45"
        aria-label={t('common.closeDialog')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {t('login.photoCredits')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-4 text-sm text-ink-soft">{t('login.creditsIntro')}</p>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-sm text-ink-soft">
          {CREDIT_LINES.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function FieldRow({
  id,
  label,
  type,
  value,
  autoComplete,
  active,
  disabled,
  last = false,
  onFocus,
  onBlur,
  onChange,
}: {
  id: string
  label: string
  type: string
  value: string
  autoComplete: string
  active: boolean
  disabled: boolean
  last?: boolean
  onFocus: () => void
  onBlur: () => void
  onChange: (v: string) => void
}) {
  return (
    <div
      className={`flex transition-colors duration-150 ${last ? '' : 'border-b border-line'} ${
        active ? 'bg-cream/60' : 'bg-transparent'
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col px-3 py-2.5">
        <label
          htmlFor={id}
          className={`text-[11px] transition-[color,font-weight] duration-150 ${
            active ? 'font-medium text-forest' : 'font-normal text-ink-soft'
          }`}
        >
          {label}
        </label>
        <input
          id={id}
          type={type}
          dir="ltr"
          value={value}
          autoComplete={autoComplete}
          disabled={disabled}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={(e) => onChange(e.target.value)}
          name={autoComplete === 'email' ? 'email' : autoComplete === 'current-password' ? 'password' : autoComplete}
          className="login-input w-full bg-transparent text-sm text-ink"
        />
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
