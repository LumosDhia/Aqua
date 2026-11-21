import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ar from './locales/ar.json'
import ja from './locales/ja.json'

export const languages = ['en', 'ar', 'ja'] as const
export type Language = (typeof languages)[number]
const STORAGE_KEY = 'aqua.language'

function supported(value: string): value is Language {
  return languages.some((language) => language === value)
}

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && supported(saved)) return saved
  } catch {
    // Browser storage may be unavailable.
  }
  return (navigator.languages ?? [navigator.language])
    .map((locale) => locale.toLowerCase().split('-')[0])
    .find(supported) ?? 'en'
}

function applyLanguage(value: string) {
  const language = supported(value) ? value : 'en'
  document.documentElement.lang = language
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // The current language still applies for this session.
  }
}

export function initializeI18n() {
  const lng = initialLanguage()
  applyLanguage(lng)
  i18n.on('languageChanged', applyLanguage)
  return i18n.use(initReactI18next).init({
    lng,
    supportedLngs: languages,
    fallbackLng: 'en',
    resources: { en: { translation: en }, ar: { translation: ar }, ja: { translation: ja } },
    interpolation: { escapeValue: false },
  })
}

export function activeLocale(): string {
  return i18n.resolvedLanguage ?? 'en'
}

export const t = i18n.t.bind(i18n)

export function countLabel(key: string, count: number) {
  const number = new Intl.NumberFormat(activeLocale()).format(count)
  return t(key, { count, number })
}
