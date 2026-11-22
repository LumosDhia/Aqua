import { t } from './i18n'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { ApiError, api, getToken, setToken, type User } from './api'
import { Logo } from './components/Logo'
import { SignupFlow } from './components/onboarding/SignupFlow'
import { type WizardCreated } from './components/onboarding/FarmerWizard'
import {
  clearOnboardingPending,
  hasSkippedOnboarding,
  isOnboardingPending,
  markOnboardingSkipped,
  setPreferredFarm,
} from './lib/onboarding'
import { isSignupHash, VIEW_HREF } from './lib/view'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { WorkerApp } from './pages/WorkerApp'

type Gate = 'farmer' | 'worker' | null

async function decideOnboarding(user: User, reason: 'boot' | 'switch'): Promise<Gate> {
  // Someone who already belongs to a farm is past first-run setup.
  if ((user.accessible_farm_count ?? user.farm_count ?? 0) > 0) return null
  if (user.account_type === 'farmer') return 'farmer'
  let hasCv = false
  try {
    hasCv = (await api.myCv()).cv != null
  } catch {
    hasCv = false
  }
  if (hasCv) return null
  if (reason === 'switch') return 'worker'
  if (isOnboardingPending(user.id)) return 'worker'
  if (hasSkippedOnboarding(user.id)) return null
  return 'worker'
}

export default function App() {
  useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const [onboarding, setOnboarding] = useState<Gate>(null)
  const [checking, setChecking] = useState(false)
  const [createdFarmId, setCreatedFarmId] = useState<number | null>(null)
  const [signupHash, setSignupHash] = useState(() => isSignupHash())

  useEffect(() => {
    // A file dropped outside a drop zone must never make the browser open it and leave the app.
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const stop = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  useEffect(() => {
    function onHash() {
      setSignupHash(isSignupHash())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setReady(true)
      return
    }
    let active = true
    api
      .me()
      .then(async (next) => {
        const gate = await decideOnboarding(next, 'boot')
        if (!active) return
        setUser(next)
        setOnboarding(gate)
        if (!gate && isSignupHash()) {
          window.location.hash = VIEW_HREF.dashboard
          setSignupHash(false)
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) setToken(null)
        else setSessionError(t('auth.sessionError'))
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => { active = false }
  }, [sessionAttempt])

  async function finishLogin(next: User) {
    setUser(next)
    setChecking(true)
    try {
      const gate = await decideOnboarding(next, 'boot')
      setOnboarding(gate)
      if ((next.account_type === 'farmer' && !gate) || isSignupHash()) openDashboard()
    } finally {
      setChecking(false)
    }
  }

  function handleUser(next: User) {
    const switched = user != null && next.account_type !== user.account_type
    setUser(next)
    if (!switched) return
    setChecking(true)
    void decideOnboarding(next, 'switch')
      .then(setOnboarding)
      .finally(() => setChecking(false))
  }

  const onLogout = () => {
    setToken(null)
    setUser(null)
    setOnboarding(null)
    setCreatedFarmId(null)
    if (isSignupHash()) openDashboard()
  }

  function skipOnboarding() {
    if (user) markOnboardingSkipped(user.id)
    setOnboarding(null)
  }

  function rememberFarm(info: WizardCreated) {
    if (!user) return
    clearOnboardingPending(user.id)
    setPreferredFarm(user.id, info.farmId)
    setCreatedFarmId(info.farmId)
    setUser({
      ...user,
      farm_count: Math.max(1, user.farm_count ?? 0),
      accessible_farm_count: Math.max(1, user.accessible_farm_count ?? 0),
    })
  }

  function openDashboard() {
    window.location.hash = VIEW_HREF.dashboard
    setSignupHash(false)
  }

  function finishFarmer() {
    setOnboarding(null)
    openDashboard()
  }

  function finishWorker() {
    setUser((u) => {
      if (u) clearOnboardingPending(u.id)
      return u
    })
    setOnboarding(null)
    if (isSignupHash()) window.location.hash = VIEW_HREF.dashboard
  }

  function handleAccountCreated(next: User) {
    setUser(next)
    setOnboarding(next.account_type === 'farmer' ? 'farmer' : 'worker')
  }

  if (!ready || checking) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Logo size={56} className="text-forest" title="Aqua" />
      </div>
    )
  }

  if (sessionError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
        <p role="alert" className="text-sm text-ink">{sessionError}</p>
        <button
          type="button"
          className="rounded-full bg-forest-deep px-5 py-2 text-sm text-white"
          onClick={() => {
            setSessionError('')
            setReady(false)
            setSessionAttempt((attempt) => attempt + 1)
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  const journey =
    (!user && signupHash) || onboarding === 'farmer' || onboarding === 'worker'

  if (journey) {
    return (
      <SignupFlow
        user={user}
        onAccountCreated={handleAccountCreated}
        onLogout={onLogout}
        onSkip={skipOnboarding}
        onFarmSaved={rememberFarm}
        onFinishFarmer={finishFarmer}
        onFinishWorker={finishWorker}
        onLogin={() => {
          window.location.hash = VIEW_HREF.dashboard
        }}
      />
    )
  }

  if (!user) return <Login onDone={finishLogin} />

  if (user.account_type === 'worker') {
    return <WorkerApp user={user} onLogout={onLogout} onUser={handleUser} />
  }

  return (
    <Dashboard
      user={user}
      onLogout={onLogout}
      onUser={handleUser}
      onSetupFarm={() => setOnboarding('farmer')}
      initialFarmId={createdFarmId}
    />
  )
}
