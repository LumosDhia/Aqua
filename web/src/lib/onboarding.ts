const PENDING_PREFIX = 'aqua_onboarding_'
const SKIP_PREFIX = 'aqua_onboarding_skip_'
const SIGNUP_DRAFT_KEY = 'aqua_signup_draft'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1')
    else localStorage.removeItem(key)
  } catch {
    /* private mode / quota */
  }
}

export function markOnboardingPending(userId: number): void {
  writeFlag(`${PENDING_PREFIX}${userId}`, true)
}

export function isOnboardingPending(userId: number): boolean {
  return readFlag(`${PENDING_PREFIX}${userId}`)
}

export function clearOnboardingPending(userId: number): void {
  writeFlag(`${PENDING_PREFIX}${userId}`, false)
}

export function markOnboardingSkipped(userId: number): void {
  writeFlag(`${SKIP_PREFIX}${userId}`, true)
  writeFlag(`${PENDING_PREFIX}${userId}`, false)
}

export function hasSkippedOnboarding(userId: number): boolean {
  return readFlag(`${SKIP_PREFIX}${userId}`)
}

export type AccountDraft = {
  step: 0 | 1 | 2 | 3
  accountType: 'farmer' | 'worker'
  name: string
  email: string
}

export function readAccountDraft(): AccountDraft | null {
  try {
    const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as Partial<AccountDraft> | null
    if (!draft || ![0, 1, 2, 3].includes(draft.step ?? -1)
      || (draft.accountType !== 'farmer' && draft.accountType !== 'worker')
      || typeof draft.name !== 'string' || typeof draft.email !== 'string') return null
    return draft as AccountDraft
  } catch {
    return null
  }
}

export function saveAccountDraft(draft: AccountDraft | null): void {
  try {
    if (draft) sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft))
    else sessionStorage.removeItem(SIGNUP_DRAFT_KEY)
  } catch {
    // The current form remains usable when storage is unavailable.
  }
}

export function firstNameOf(name: string, email: string): string {
  const part = name.trim().split(/\s+/).filter(Boolean)[0]
  if (part) return part
  const local = email.split('@')[0]
  return local || email
}

const FARM_PREFIX = 'aqua_current_farm_'

/** Prefer the farm this person just set up when opening their dashboard. */
export function setPreferredFarm(userId: number, farmId: number): void {
  try {
    localStorage.setItem(`${FARM_PREFIX}${userId}`, String(farmId))
  } catch {
    /* private mode / quota */
  }
}

export function getPreferredFarm(userId: number): number | null {
  try {
    const n = Number(localStorage.getItem(`${FARM_PREFIX}${userId}`))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}
