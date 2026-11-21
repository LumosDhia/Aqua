import { t } from '../../i18n'
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { ApiError, api, setToken, type AccountType, type User } from '../../api'
import { firstNameOf, isOnboardingPending, markOnboardingPending, readAccountDraft, saveAccountDraft } from '../../lib/onboarding'
import { CvFlow, type CvFlowHandle, type CvMeta } from '../cv/CvFlow'
import { DoneScreen, type CvDoneSummary, type FarmDoneSummary } from './DoneScreen'
import {
  FarmerWizard,
  type FarmerMeta,
  type FarmerWizardHandle,
  type WizardCreated,
} from './FarmerWizard'
import {
  ACCOUNT_PICTURES,
  CV_CHOICE_PICTURE,
  CV_DONE_PICTURE,
  CV_REVIEW_PICTURE,
  FARM_DONE_PICTURE,
  FARM_PICTURES,
  JOURNEY_PHOTOS,
  isValidEmail,
  passwordHint,
  passwordStrength,
  type JourneyPicture,
} from './journey'
import { OnboardingShell } from './OnboardingShell'
import { FieldError } from './FieldError'
import { WIZARD_STEPS } from './model'

type Phase = 'account' | 'farm' | 'cv' | 'done'
type AccountIndex = 0 | 1 | 2 | 3

const ACCOUNT_TITLES = [
  { get title() { return t('onboarding.who') }, get helper() { return t('onboarding.whoHelp') } },
  { get title() { return t('onboarding.nameQuestion') }, get helper() { return t('onboarding.nameHelp') } },
  { get title() { return t('onboarding.emailQuestion') }, get helper() { return t('onboarding.emailHelp') } },
  { get title() { return t('onboarding.passwordQuestion') }, get helper() { return t('onboarding.passwordHint') } },
] as const

type SignupFlowProps = {
  user: User | null
  onAccountCreated: (user: User) => void
  onLogout: () => void
  onSkip: () => void
  onFarmSaved: (info: WizardCreated) => void
  onFinishFarmer: () => void
  onFinishWorker: () => void
  onLogin: () => void
}

export function SignupFlow({
  user,
  onAccountCreated,
  onLogout,
  onSkip,
  onFarmSaved,
  onFinishFarmer,
  onFinishWorker,
  onLogin,
}: SignupFlowProps) {
  const [accountDraft] = useState(() => user ? null : readAccountDraft())
  const [startedAtSignup] = useState(() => !user || isOnboardingPending(user.id))
  const registering = useRef(false)
  const farmerRef = useRef<FarmerWizardHandle>(null)
  const cvRef = useRef<CvFlowHandle>(null)
  const [phase, setPhase] = useState<Phase>(() => {
    if (!user) return 'account'
    return user.account_type === 'worker' ? 'cv' : 'farm'
  })
  const [accountStep, setAccountStep] = useState<AccountIndex>(accountDraft?.step ?? 0)
  const [accountType, setAccountType] = useState<AccountType>(accountDraft?.accountType ?? 'farmer')
  const [name, setName] = useState(accountDraft?.name ?? '')
  const [email, setEmail] = useState(accountDraft?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [emailTaken, setEmailTaken] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [farmerMeta, setFarmerMeta] = useState<FarmerMeta | null>(null)
  const [cvMeta, setCvMeta] = useState<CvMeta | null>(null)
  const [farmDone, setFarmDone] = useState<FarmDoneSummary | null>(null)
  const [cvDone, setCvDone] = useState<CvDoneSummary | null>(null)
  const [staying, setStaying] = useState(false)
  const farmerRefEl = useRef<HTMLButtonElement>(null)
  const workerRefEl = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (phase === 'account') saveAccountDraft({ step: accountStep, accountType, name, email })
  }, [phase, accountStep, accountType, name, email])

  const accountOffset = startedAtSignup ? ACCOUNT_TITLES.length : 0
  const kind: 'farmer' | 'worker' =
    cvDone != null || phase === 'cv' || (phase === 'account' && accountType === 'worker')
      ? 'worker'
      : 'farmer'

  const farmerTotal = WIZARD_STEPS.length
  const cvTotal = cvMeta?.total ?? 1
  const workTotal = kind === 'farmer' ? farmerTotal : cvTotal
  const total = accountOffset + workTotal + 1

  let step = 1
  if (phase === 'account') step = accountStep + 1
  else if (phase === 'farm') step = accountOffset + (farmerMeta?.index ?? 0) + 1
  else if (phase === 'cv') step = accountOffset + (cvMeta?.step ?? 0) + 1
  else step = total

  const picture = currentPicture(phase, accountStep, farmerMeta?.index ?? 0, cvMeta?.picture, kind)
  const preloadSrc = nextPictureSrc(phase, accountStep, farmerMeta?.index ?? 0, kind, cvMeta)

  const title =
    phase === 'done'
      ? t('onboarding.complete')
      : phase === 'account'
        ? ACCOUNT_TITLES[accountStep].title
        : phase === 'farm'
          ? (farmerMeta?.title ?? WIZARD_STEPS[0].title)
          : (cvMeta?.title ?? t('cv.title'))
  const helper =
    phase === 'done'
      ? ''
      : phase === 'account'
        ? ACCOUNT_TITLES[accountStep].helper
        : phase === 'farm'
          ? (farmerMeta?.helper ?? '')
          : (cvMeta?.helper ?? '')

  const hideNext =
    phase === 'account' && accountStep === 0
      ? false
      : phase === 'cv'
        ? (cvMeta?.hideNext ?? true)
        : false
  const nextLabel =
    phase === 'done'
      ? kind === 'worker'
        ? t('onboarding.workerHome')
        : t('onboarding.openDashboard')
      : phase === 'farm'
        ? (farmerMeta?.last ? t('onboarding.createFarm') : t('common.next'))
        : phase === 'cv'
          ? (cvMeta?.nextLabel ?? t('common.next'))
          : t('common.next')
  const nextHint =
    phase === 'done' || (phase === 'farm' && farmerMeta?.last) ? 'leaf' : 'arrow'
  const accountError = accountFieldError(accountStep, name, email, password)
  const fieldError = accountStep === 2 && emailTaken
    ? t('onboarding.emailTaken')
    : attempted ? accountError : ''
  const nextDisabled =
    phase === 'done'
      ? false
      : phase === 'account'
        ? busy
        : phase === 'farm'
          ? (farmerMeta?.blocked ?? true)
          : (cvMeta?.nextDisabled ?? true)
  const nextReason =
    phase === 'cv' ? cvMeta?.nextReason : undefined
  const nextBusy =
    busy ||
    (phase === 'farm' && (farmerMeta?.busy ?? false)) ||
    (phase === 'cv' && (cvMeta?.busy ?? false))
  const busyLabel =
    phase === 'account'
      ? t('onboarding.creating')
      : phase === 'farm'
        ? t('onboarding.settingUp')
        : (cvMeta?.busyLabel ?? t('common.wait'))
  const canBack =
    phase === 'account'
      ? accountStep > 0 && !busy
      : phase === 'farm'
        ? (farmerMeta?.canBack ?? false)
        : phase === 'cv'
          ? (cvMeta?.canBack ?? false)
          : false
  const hideBack = phase === 'done'
  const accountExists = user != null || phase !== 'account'
  const skipOff = nextBusy || phase === 'done'

  function goAccount(next: AccountIndex) {
    setAttempted(false)
    setErr('')
    setAccountStep(next)
  }

  async function submitAccount() {
    if (registering.current) return
    if (accountError || (accountStep === 2 && emailTaken)) {
      setAttempted(true)
      return
    }
    if (accountStep < 3) {
      goAccount((accountStep + 1) as AccountIndex)
      return
    }
    registering.current = true
    setBusy(true)
    setErr('')
    const trimmedEmail = email.trim()
    const trimmedName = name.trim()
    try {
      const { access_token, ...created } = await api.register(trimmedEmail, password, trimmedName, accountType)
      markOnboardingPending(created.id)
      setToken(access_token, true)
      saveAccountDraft(null)
      setPassword('')
      setPhase(created.account_type === 'worker' ? 'cv' : 'farm')
      onAccountCreated({ ...created, farm_count: 0 })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        goAccount(2)
        setEmailTaken(true)
      } else {
        setErr(error instanceof ApiError ? error.message : t('onboarding.signupError'))
      }
    } finally {
      registering.current = false
      setBusy(false)
    }
  }

  function onNext() {
    if (phase === 'account') void submitAccount()
    else if (phase === 'farm') farmerRef.current?.next()
    else if (phase === 'cv') cvRef.current?.next()
    else if (kind === 'worker') onFinishWorker()
    else onFinishFarmer()
  }

  function onBack() {
    if (phase === 'account') {
      if (accountStep > 0) goAccount((accountStep - 1) as AccountIndex)
      return
    }
    if (phase === 'farm') farmerRef.current?.back()
    if (phase === 'cv') cvRef.current?.back()
  }

  function onWhoKey(e: KeyboardEvent<HTMLDivElement>) {
    if (
      e.key !== 'ArrowRight' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowUp' &&
      e.key !== 'ArrowDown'
    ) {
      return
    }
    e.preventDefault()
    const next: AccountType = accountType === 'farmer' ? 'worker' : 'farmer'
    setAccountType(next)
    ;(next === 'farmer' ? farmerRefEl : workerRefEl).current?.focus()
  }

  const extras = phase === 'cv' && cvMeta?.showStartOver ? (
      <button
        type="button"
        onClick={() => cvRef.current?.startOver()}
        className="rounded-full px-3 py-1.5 text-sm text-ink-soft hover:text-forest"
      >
        {t('cv.restart')}
      </button>
    ) : null

  return (
    <OnboardingShell
      step={step}
      total={total}
      title={title}
      helper={helper}
      picture={picture}
      preloadSrc={preloadSrc}
      greeting={phase === 'farm' && user && (farmerMeta?.index ?? 0) === 0 ? firstNameOf(user.name, user.email) : null}
      accountExists={accountExists}
      onLogout={accountExists ? onLogout : undefined}
      onSkip={phase === 'cv' ? onSkip : undefined}
      skipDisabled={skipOff}
      onLogin={onLogin}
      nextLabel={nextLabel}
      nextHint={nextHint}
      nextDisabled={nextDisabled}
      nextReason={nextReason}
      nextBusy={nextBusy}
      busyLabel={busyLabel}
      onNext={onNext}
      submitForm={phase === 'account' || phase === 'farm'}
      hideNext={hideNext && phase !== 'done'}
      onBack={onBack}
      backDisabled={!canBack}
      hideBack={hideBack}
      extras={extras}
    >
      {phase === 'account' && accountStep === 0 ? (
        <div
          role="radiogroup"
          aria-label={t('onboarding.whoLabel')}
          onKeyDown={onWhoKey}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <WhoCard
            checked={accountType === 'farmer'}
            disabled={busy}
            photo={JOURNEY_PHOTOS.farmerTerrace}
            title={t('onboarding.farmer')}
            help={t('onboarding.farmerHelp')}
            buttonRef={farmerRefEl}
            onSelect={() => setAccountType('farmer')}
          />
          <WhoCard
            checked={accountType === 'worker'}
            disabled={busy}
            photo={JOURNEY_PHOTOS.sheepfold}
            title={t('onboarding.worker')}
            help={t('onboarding.workerHelp')}
            buttonRef={workerRefEl}
            onSelect={() => setAccountType('worker')}
          />
        </div>
      ) : null}

      {phase === 'account' && accountStep === 1 ? (
        <div>
          <label htmlFor="signup-name" className="text-xs font-medium text-ink-soft">
            {t('onboarding.name')}
          </label>
          <input
            id="signup-name"
            name="name"
            type="text"
            autoComplete="name"
            maxLength={120}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'signup-field-error' : undefined}
            value={name}
            disabled={busy}
            onChange={(e) => {
              setName(e.target.value)
              setErr('')
            }}
            className="journey-field mt-1"
          />
          <FieldError id="signup-field-error" message={fieldError} />
        </div>
      ) : null}

      {phase === 'account' && accountStep === 2 ? (
        <div>
          <label htmlFor="signup-email" className="text-xs font-medium text-ink-soft">
            {t('login.email')}
          </label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            disabled={busy}
            maxLength={200}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'signup-field-error' : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailTaken(false)
              setErr('')
            }}
            className="journey-field mt-1"
          />
          <FieldError id="signup-field-error" message={fieldError} />
        </div>
      ) : null}

      {phase === 'account' && accountStep === 3 ? (
        <div>
          <input type="text" name="name" autoComplete="name" value={name} readOnly hidden />
          <input type="email" name="email" autoComplete="email" value={email} readOnly hidden />
          <label htmlFor="signup-password" className="text-xs font-medium text-ink-soft">
            {t('login.password')}
          </label>
          <div className="relative mt-1">
            <input
              id="signup-password"
              name="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              maxLength={200}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'signup-field-error' : undefined}
              value={password}
              disabled={busy}
              onChange={(e) => {
                setPassword(e.target.value)
                setErr('')
              }}
              className="journey-field pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? t('onboarding.hidePassword') : t('onboarding.showPassword')}
              className="absolute top-1/2 end-2 -translate-y-1/2 rounded-full p-2 text-ink-soft hover:text-forest"
            >
              {showPw ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
            </button>
          </div>
          <PasswordHint password={password} />
          <FieldError id="signup-field-error" message={fieldError} />
        </div>
      ) : null}

      {phase === 'account' && err ? (
        <p className="mt-3 text-sm text-hanko" role="alert">
          {err}
        </p>
      ) : null}

      {phase === 'farm' && user ? (
        <FarmerWizard
          key={user.id}
          userId={user.id}
          ref={farmerRef}
          onCreated={(info) => {
            setFarmDone(info)
            onFarmSaved(info)
            setPhase('done')
          }}
          onMeta={setFarmerMeta}
        />
      ) : null}

      {phase === 'cv' ? (
        <CvFlow
          ref={cvRef}
          layout="journey"
          defaultName={user?.name ?? name}
          onDone={onFinishWorker}
          onSkip={onSkip}
          onMeta={setCvMeta}
          onSaved={(summary) => {
            setCvDone(summary)
            setPhase('done')
          }}
        />
      ) : null}

      {phase === 'done' ? (
        <DoneScreen
          kind={kind}
          farm={farmDone ?? undefined}
          cv={cvDone ?? undefined}
          staying={staying}
          onOpen={() => {
            if (kind === 'worker') onFinishWorker()
            else onFinishFarmer()
          }}
          onStay={() => setStaying(true)}
        />
      ) : null}
    </OnboardingShell>
  )
}

function currentPicture(
  phase: Phase,
  accountStep: AccountIndex,
  farmStep: number,
  cvPicture: CvMeta['picture'] | undefined,
  kind: 'farmer' | 'worker',
): JourneyPicture {
  if (phase === 'account') return ACCOUNT_PICTURES[accountStep] ?? ACCOUNT_PICTURES[0]
  if (phase === 'farm') return FARM_PICTURES[farmStep] ?? FARM_PICTURES[0]
  if (phase === 'cv') return cvPicture === 'review' ? CV_REVIEW_PICTURE : CV_CHOICE_PICTURE
  return kind === 'worker' ? CV_DONE_PICTURE : FARM_DONE_PICTURE
}

function nextPictureSrc(
  phase: Phase,
  accountStep: AccountIndex,
  farmStep: number,
  kind: 'farmer' | 'worker',
  cvMeta: CvMeta | null,
): string | undefined {
  if (phase === 'account') {
    if (accountStep < 3) return ACCOUNT_PICTURES[accountStep + 1]?.src
    return kind === 'worker' ? CV_CHOICE_PICTURE.src : FARM_PICTURES[0].src
  }
  if (phase === 'farm') {
    if (farmStep < FARM_PICTURES.length - 1) return FARM_PICTURES[farmStep + 1]?.src
    return FARM_DONE_PICTURE.src
  }
  if (phase === 'cv') {
    if (cvMeta?.picture === 'choice') return CV_REVIEW_PICTURE.src
    return CV_DONE_PICTURE.src
  }
  return undefined
}

function accountFieldError(step: AccountIndex, name: string, email: string, password: string): string {
  if (step === 1 && !name.trim()) return t('onboarding.nameRequired')
  if (step === 2 && !isValidEmail(email)) return t('onboarding.emailInvalid')
  if (step === 3 && Array.from(password).length < 8) return t('onboarding.passwordShort')
  return ''
}

function WhoCard({
  checked,
  disabled,
  photo,
  title,
  help,
  buttonRef,
  onSelect,
}: {
  checked: boolean
  disabled: boolean
  photo: { src: string; alt: string }
  title: string
  help: string
  buttonRef: Ref<HTMLButtonElement>
  onSelect: () => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={checked}
      tabIndex={checked ? 0 : -1}
      disabled={disabled}
      onClick={onSelect}
      data-card=""
      className={`overflow-hidden rounded-card border text-start transition-transform hover:-translate-y-0.5 ${
        checked ? 'border-forest bg-leaf-soft/40' : 'border-line bg-white'
      }`}
    >
      <img src={photo.src} alt={photo.alt} className="h-28 w-full object-cover" />
      <span className="block px-3 py-3">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              checked ? 'border-forest' : 'border-mute'
            }`}
          >
            {checked ? <span className="h-2 w-2 rounded-full bg-forest" /> : null}
          </span>
          <span className="font-serif text-lg text-ink">{title}</span>
        </span>
        <span className="mt-1 block text-sm text-ink-soft">{help}</span>
      </span>
    </button>
  )
}

function PasswordHint({ password }: { password: string }) {
  const level = passwordStrength(password)
  const label =
    level === 0 ? t('onboarding.emptyPassword') : level === 1 ? t('onboarding.shortPassword') : level === 2 ? t('onboarding.fairPassword') : t('onboarding.strongPassword')
  return (
    <div className="mt-3">
      <p className="text-sm text-ink-soft">{passwordHint(password)}</p>
      <div
        className="mt-2 flex gap-1"
        role="meter"
        aria-label={t('onboarding.passwordStrength', { strength: label })}
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={level}
      >
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            aria-hidden
            className={`h-1 flex-1 rounded-full ${
              level >= n ? (level >= 3 ? 'bg-leaf' : level === 2 ? 'bg-ochre' : 'bg-mute') : 'bg-cream-deep'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
