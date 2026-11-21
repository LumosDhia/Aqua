import { t } from '../../i18n'
export type JourneyPicture = {
  src: string
  alt: string
  kicker: string
  line: string
}

const BASE = '/img/onboarding'

export const JOURNEY_PHOTOS = {
  oliveTestour: {
    src: `${BASE}/tn-olive-testour.jpg`,
    get alt() { return t('login.slides.testourAlt') },
  },
  farmerTerrace: {
    src: `${BASE}/jp-farmer-terrace.jpg`,
    get alt() { return t('login.slides.niigataAlt') },
  },
  capBon: {
    src: `${BASE}/tn-cap-bon-olive.jpg`,
    get alt() { return t('login.slides.capBonAlt') },
  },
  nishigaoka: {
    src: `${BASE}/jp-nishigaoka-terrace.jpg`,
    get alt() { return t('login.slides.nishigaokaAlt') },
  },
  shizuoka: {
    src: `${BASE}/jp-shizuoka-tea.jpg`,
    get alt() { return t('login.slides.shizuokaAlt') },
  },
  sheepfold: {
    src: `${BASE}/tn-sheepfold.jpg`,
    get alt() { return t('onboarding.journey.sheepfold') },
  },
  tozeur: {
    src: `${BASE}/tn-tozeur-oasis.jpg`,
    get alt() { return t('login.slides.tozeurAlt') },
  },
} as const

function pic(
  photo: (typeof JOURNEY_PHOTOS)[keyof typeof JOURNEY_PHOTOS],
  kicker: string,
  line: string,
): JourneyPicture {
  return {
    src: photo.src,
    get alt() { return photo.alt },
    get kicker() { return t(kicker) },
    get line() { return t(line) },
  }
}

export const ACCOUNT_PICTURES: JourneyPicture[] = [
  pic(JOURNEY_PHOTOS.oliveTestour, 'onboarding.journey.welcome', 'onboarding.journey.tagline'),
  pic(JOURNEY_PHOTOS.farmerTerrace, 'onboarding.journey.greeting', 'onboarding.journey.greetingHelp'),
  pic(JOURNEY_PHOTOS.capBon, 'onboarding.journey.contact', 'onboarding.journey.contactHelp'),
  pic(JOURNEY_PHOTOS.nishigaoka, 'onboarding.journey.security', 'onboarding.journey.securityHelp'),
]

export const FARM_PICTURES: JourneyPicture[] = [
  pic(JOURNEY_PHOTOS.capBon, 'onboarding.journey.farm', 'onboarding.journey.farmHelp'),
  pic(JOURNEY_PHOTOS.tozeur, 'onboarding.journey.drawing', 'onboarding.journey.drawingHelp'),
  pic(JOURNEY_PHOTOS.shizuoka, 'onboarding.journey.crops', 'onboarding.journey.cropsHelp'),
  pic(JOURNEY_PHOTOS.farmerTerrace, 'onboarding.journey.water', 'onboarding.journey.waterHelp'),
  pic(JOURNEY_PHOTOS.sheepfold, 'onboarding.journey.animals', 'onboarding.journey.animalsHelp'),
  pic(JOURNEY_PHOTOS.nishigaoka, 'onboarding.journey.almost', 'onboarding.journey.review'),
]

export const FARM_DONE_PICTURE = pic(
  JOURNEY_PHOTOS.oliveTestour,
  'onboarding.journey.done',
  'onboarding.journey.tagline',
)

export const CV_CHOICE_PICTURE = pic(
  JOURNEY_PHOTOS.capBon,
  'onboarding.journey.work',
  'onboarding.journey.workHelp',
)

export const CV_REVIEW_PICTURE = pic(
  JOURNEY_PHOTOS.shizuoka,
  'onboarding.journey.lastLook',
  'onboarding.journey.lastLookHelp',
)

export const CV_DONE_PICTURE = pic(
  JOURNEY_PHOTOS.oliveTestour,
  'onboarding.journey.done',
  'onboarding.journey.lastLookHelp',
)

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function passwordHint(password: string): string {
  if (password.length === 0) return t('onboarding.passwordHint')
  if (password.length < 8) return t('onboarding.passwordMore')
  const kinds =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password))
  if (kinds >= 3) return t('onboarding.passwordStrong')
  if (kinds >= 2) return t('onboarding.passwordFair')
  return t('onboarding.passwordLong')
}

export function passwordStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0
  if (password.length < 8) return 1
  const kinds =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/\d/.test(password)) +
    Number(/[^A-Za-z0-9]/.test(password))
  if (kinds >= 3) return 3
  return 2
}
