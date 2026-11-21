import { t } from '../i18n'
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

const tabs = [
  ['map', 'dashboard.tabs.map'],
  ['plants', 'dashboard.tabs.plants'],
  ['animals', 'water.animals'],
  ['soil', 'dashboard.soil'],
  ['log', 'dashboard.tabs.log'],
] as const

export type DashboardTab = (typeof tabs)[number][0]
const storageKey = 'aqua_dash_panel'

export function dashboardPanelFromHash(hash = typeof window === 'undefined' ? '' : window.location.hash): DashboardTab | null {
  const query = hash.indexOf('?')
  if (query < 0) return null
  const raw = new URLSearchParams(hash.slice(query + 1)).get('panel')
  return tabs.find(([tab]) => tab === raw)?.[0] ?? null
}

export function readDashboardTab(): DashboardTab {
  try {
    const saved = localStorage.getItem(storageKey)
    return tabs.find(([tab]) => tab === saved)?.[0]
      ?? (new URLSearchParams(window.location.search).get('view') === 'garden' ? 'plants' : 'map')
  } catch {
    return 'map'
  }
}

export function rememberDashboardTab(tab: DashboardTab) {
  try {
    localStorage.setItem(storageKey, tab)
  } catch {
    // The current selection still works with storage disabled.
  }
}

export function DashboardSide({
  active, onChange, children,
}: {
  active: DashboardTab
  onChange: (tab: DashboardTab) => void
  children: ReactNode
}) {
  const id = useId()
  const buttons = useRef<Array<HTMLButtonElement | null>>([])

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number
    switch (event.key) {
      case 'ArrowLeft': next = (index + tabs.length - 1) % tabs.length; break
      case 'ArrowRight': next = (index + 1) % tabs.length; break
      case 'Home': next = 0; break
      case 'End': next = tabs.length - 1; break
      default: return
    }
    event.preventDefault()
    onChange(tabs[next][0])
    buttons.current[next]?.focus()
  }

  return (
    <aside data-card="" aria-label={t('farm.details')} className="flex h-[36rem] min-h-0 min-w-0 shrink-0 flex-col gap-3 rounded-card border border-line bg-cream p-2 lg:h-full">
      <div role="tablist" aria-label={t('farm.details')} className="grid shrink-0 grid-cols-5 gap-0.5 rounded-full border border-line bg-paper p-0.5">
        {tabs.map(([tab, label], i) => (
          <button
            key={tab}
            id={`${id}-${tab}-tab`}
            ref={(button) => { buttons.current[i] = button }}
            type="button"
            role="tab"
            aria-selected={active === tab}
            aria-controls={`${id}-${tab}-panel`}
            tabIndex={active === tab ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={`min-w-0 rounded-full px-1 py-1.5 text-xs font-medium ${active === tab ? 'bg-forest-deep text-white' : 'text-ink-soft hover:bg-cream-deep'}`}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {tabs.map(([tab]) => (
        <div
          key={tab}
          id={`${id}-${tab}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-${tab}-tab`}
          tabIndex={active === tab ? 0 : -1}
          hidden={active !== tab}
          className="page-scroll relative min-h-0 flex-1 rounded-card"
        >
          {active === tab ? children : null}
        </div>
      ))}
    </aside>
  )
}
