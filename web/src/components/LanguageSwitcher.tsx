import { useTranslation } from 'react-i18next'
import { languages, type Language } from '../i18n'

const names: Record<Language, string> = { en: 'EN', ar: 'عربي', ja: '日本語' }

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  return (
    <div role="group" aria-label={t('common.language')} dir="ltr" className="flex shrink-0 items-center gap-0.5 rounded-full bg-cream p-0.5">
      {languages.map((language) => {
        const active = i18n.resolvedLanguage === language
        return (
          <button
            key={language}
            type="button"
            lang={language}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            aria-pressed={active}
            onClick={() => void i18n.changeLanguage(language)}
            className={active
              ? 'rounded-full bg-forest px-2 py-1 text-xs font-medium text-white'
              : 'rounded-full px-2 py-1 text-xs font-medium text-ink-soft hover:bg-cream-deep'}
          >
            {names[language]}
          </button>
        )
      })}
    </div>
  )
}
