import { t, countLabel } from '../i18n'
import { rememberDashboardTab } from './DashboardSide'
import type { Notice } from '../lib/notices'
import { formatRelative } from '../lib/status'
import { setWaterTabNeeds } from '../lib/view'

export function NotificationsPanel({
  shown,
  read,
  problems,
  ready,
  unread,
  onMark,
  onMarkAll,
  onNavigate,
}: {
  shown: Notice[]
  read: Set<string>
  problems: string[]
  ready: boolean
  unread: number
  onMark: (id: string) => void
  onMarkAll: (ids: string[]) => void
  onNavigate: () => void
}) {
  const fresh = unread
  const empty = ready && shown.length === 0 && problems.length === 0
  const freshLabel = !ready
    ? t('notifications.checking')
    : fresh === 0
      ? t('notifications.noneNew')
      : countLabel('notifications.newCount', fresh)

  return (
    <div
      role="dialog"
      aria-label={t('notifications.title')}
      className="notification-popover absolute end-0 z-40 mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-card border border-line bg-white p-3 shadow-shell"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-serif text-base text-ink">{t('notifications.title')}</h2>
        <p className="text-xs text-ink-soft">{freshLabel}</p>
      </div>
      {problems.length > 0 ? (
        <p role="alert" className="mb-2 text-sm text-ink">
          {t('notifications.checkError')}{' '} {problems.join(', ')}.
        </p>
      ) : null}
      {!ready && shown.length === 0 ? (
        <p className="text-sm text-ink-soft" role="status">{t('notifications.checking')}</p>
      ) : empty ? (
        <p className="text-sm text-ink-soft">{t('notifications.empty')}</p>
      ) : shown.length > 0 ? (
        <ul className="max-h-[min(24rem,70dvh)] space-y-2 overflow-auto">
          {shown.map((item) => {
            const seen = read.has(item.id)
            const when = item.at ? formatRelative(item.at) : t('notifications.timeMissing')
            return (
              <li key={item.id}>
                <a
                  href={item.href}
                  onClick={() => {
                    if (item.open === 'log') rememberDashboardTab('log')
                    if (item.open === 'water') setWaterTabNeeds()
                    onMark(item.id)
                    onNavigate()
                  }}
                  className="block rounded-xl border border-line px-2 py-2 hover:bg-cream"
                >
                  <p className="flex flex-wrap items-center gap-1 text-[11px] font-medium text-ink">
                    <span className="rounded-full bg-cream px-2 py-0.5">{item.kind}</span>
                    <span>{seen ? t('common.seen') : t('common.new')}</span>
                  </p>
                  <p className="mt-1 font-medium text-ink">{item.title}</p>
                  <p className="text-sm text-ink-soft">{item.detail}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    {item.who} · {item.whenLabel} {when}
                  </p>
                </a>
              </li>
            )
          })}
        </ul>
      ) : null}
      {unread > 0 ? (
        <button
          type="button"
          onClick={() => onMarkAll(shown.map((item) => item.id))}
          className="mt-2 rounded-full border border-line px-3 py-1 text-xs text-ink"
        >
          {t('notifications.markAll')}
        </button>
      ) : null}
    </div>
  )
}
