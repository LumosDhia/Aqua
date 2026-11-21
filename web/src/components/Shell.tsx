import { t, countLabel } from '../i18n'
import { LanguageSwitcher } from './LanguageSwitcher'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bell,
  Briefcase,
  CloudSun,
  Cpu,
  Droplets,
  FileText,
  HardHat,
  House,
  Info,
  LayoutDashboard,
  ListFilter,
  LogOut,
  MessageCircle,
  MessageSquare,
  Search,
  ShieldCheck,
  Store,
  ContactRound,
  Tractor,
  UserRound,
  Users,
} from 'lucide-react'
import type { AccountType, User } from '../api'
import { isAdminUser } from '../api'
import { roleLabel } from '../lib/status'
import { farmWorkOnly, workspaceView } from '../lib/farmWorkspace'
import { noticeFlags } from '../lib/notices'
import { useNotices } from '../lib/useNotices'
import { VIEW_HREF, useView, workerView } from '../lib/view'
import { Logo } from './Logo'
import { NotificationsPanel } from './NotificationsPanel'
import { Portrait } from './Portrait'
import { SwitchSideDialog } from './SwitchSideDialog'

type ShellProps = {
  farmName: string
  farmId?: number | null
  /** False until the farm role is known, so the badge is not a partial count. */
  roleKnown?: boolean
  attentionOn: boolean
  onToggleAttention: () => void
  search: string
  onSearch: (q: string) => void
  user: User
  role: string
  onLogout: () => void
  onUser: (user: User) => void
  marketBadge?: number
  jobsBadge?: number
  messagesBadge?: number
  mode?: 'farm' | 'worker'
  onAbout?: () => void
  children: ReactNode
}

export function Shell({
  farmName,
  farmId = null,
  roleKnown = true,
  attentionOn,
  onToggleAttention,
  search,
  onSearch,
  user,
  role,
  onLogout,
  onUser,
  marketBadge = 0,
  jobsBadge = 0,
  messagesBadge = 0,
  mode = 'farm',
  onAbout,
  children,
}: ShellProps) {
  const { view } = useView()
  const [menu, setMenu] = useState<'bell' | 'user' | null>(null)
  const noticeMode = mode === 'worker' ? 'worker' : 'farm'
  const flags = useMemo(() => noticeFlags(noticeMode, role, user.role), [noticeMode, role, user.role])
  const notices = useNotices(user.id, farmId, flags, menu === 'bell', roleKnown)
  const fresh = notices.ready ? notices.unread : 0
  const [switchTo, setSwitchTo] = useState<AccountType | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLElement>(null)
  const searchId = useId()
  const worker = mode === 'worker'
  const workOnly = !worker && farmWorkOnly(user)
  const screen = worker ? workerView(view) : workspaceView(view, user)
  const dash = !worker && screen === 'dashboard'
  const admin = isAdminUser(user)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!barRef.current?.contains(e.target as Node)) setMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
    if (!worker && screen === 'dashboard') {
      headingRef.current?.focus()
      return
    }
    mainRef.current?.querySelector<HTMLElement>('h2[tabindex="-1"]')?.focus()
  }, [view, worker, screen])

  useEffect(() => {
    const current = railRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [screen])

  return (
    <div className="dash-page min-h-dvh p-3 sm:p-5 lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          // Hash routes live on location.hash; #main would leave the current view.
          e.preventDefault()
          mainRef.current?.focus()
        }}
      >
        {t('shell.skipContent')}
      </a>
      <div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-[1600px] flex-col overflow-hidden rounded-shell bg-white shadow-shell sm:min-h-[calc(100dvh-2.5rem)] lg:h-full lg:min-h-0 lg:flex-row">
        <nav
          ref={railRef}
          aria-label={worker ? t('shell.workerTools') : t('shell.farmTools')}
          className="relative z-40 flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-line p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:h-full lg:min-h-0 lg:w-[4.25rem] lg:min-w-[4.25rem] lg:shrink-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:border-e lg:border-b-0 lg:px-2 lg:py-5"
        >
          {worker ? (
            <>
              <RailBtn label={t('shell.home')} href={VIEW_HREF.dashboard} active={screen === 'dashboard'}>
                <House size={18} />
              </RailBtn>
              <RailBtn label={t('shell.assistant')} href={VIEW_HREF.chat} active={screen === 'chat'}>
                <MessageCircle size={18} />
              </RailBtn>
              <RailBtn label={t('shell.findWork')} href={VIEW_HREF.jobs} active={screen === 'jobs'}>
                <Briefcase size={18} />
              </RailBtn>
              <RailBtn
                label={t('shell.messages')}
                href={VIEW_HREF.messages}
                active={screen === 'messages'}
                badge={messagesBadge}
                ariaLabel={unreadAriaLabel(t('shell.messages'), messagesBadge)}
              >
                <MessageSquare size={18} />
              </RailBtn>
              <RailBtn label={t('shell.profile')} href={VIEW_HREF.profile} active={screen === 'profile'}>
                <UserRound size={18} />
              </RailBtn>
              {admin ? (
                <RailBtn label={t('shell.admin')} href={VIEW_HREF.admin} active={screen === 'admin'}>
                  <ShieldCheck size={18} />
                </RailBtn>
              ) : null}
            </>
          ) : (
            <>
          <RailGroup label={t('shell.myFarm')}>
            <RailBtn label={t('shell.dashboard')} href={VIEW_HREF.dashboard} active={screen === 'dashboard'}>
              <LayoutDashboard size={18} />
            </RailBtn>
            <RailBtn
              label={t('shell.advisor')}
              href={VIEW_HREF.chat}
              active={screen === 'chat'}
            >
              <MessageCircle size={18} />
            </RailBtn>
            <RailBtn
              label={t('shell.workers')}
              href={VIEW_HREF.workers}
              active={screen === 'workers'}
            >
              <Users size={18} />
            </RailBtn>
            <RailBtn label={t('shell.water')} href={VIEW_HREF.water} active={screen === 'water'}>
              <Droplets size={18} />
            </RailBtn>
            <RailBtn label={t('shell.devices')} href={VIEW_HREF.devices} active={screen === 'devices'}>
              <Cpu size={18} />
            </RailBtn>
            <RailBtn label={t('shell.weather')} href={VIEW_HREF.weather} active={screen === 'weather'}>
              <CloudSun size={18} />
            </RailBtn>
            {workOnly ? (
              <RailBtn label={t('shell.profile')} href={VIEW_HREF.profile} active={screen === 'profile'}>
                <UserRound size={18} />
              </RailBtn>
            ) : null}
          </RailGroup>
          {workOnly ? null : (
          <RailGroup label={t('shell.community')} padded>
            <RailBtn label={t('shell.members')} href={VIEW_HREF.members} active={screen === 'members'}>
              <ContactRound size={18} />
            </RailBtn>
            <RailBtn
              label={t('shell.market')}
              href={VIEW_HREF.market}
              active={screen === 'market'}
              badge={marketBadge}
              badgeText={
                marketBadge > 0
                  ? countLabel('market.newInquiries', marketBadge)
                  : undefined
              }
            >
              <Store size={18} />
            </RailBtn>
            <RailBtn
              label={t('shell.jobs')}
              href={VIEW_HREF.jobs}
              active={screen === 'jobs'}
              badge={jobsBadge}
              badgeText={
                jobsBadge > 0
                  ? countLabel('jobs.pendingApplications', jobsBadge)
                  : undefined
              }
            >
              <Briefcase size={18} />
            </RailBtn>
            <RailBtn
              label={t('shell.messages')}
              href={VIEW_HREF.messages}
              active={screen === 'messages'}
              badge={messagesBadge}
              ariaLabel={unreadAriaLabel(t('shell.messages'), messagesBadge)}
            >
              <MessageSquare size={18} />
            </RailBtn>
          </RailGroup>
          )}
          {admin ? (
            <RailBtn label={t('shell.admin')} href={VIEW_HREF.admin} active={screen === 'admin'}>
              <ShieldCheck size={18} />
            </RailBtn>
          ) : null}
            </>
          )}
          <div className="hidden flex-1 lg:block" />
          <RailBtn label={t('shell.logout')} onClick={onLogout}>
            <LogOut className="rtl:-scale-x-100" size={18} />
          </RailBtn>
        </nav>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            ref={barRef}
            className="shell-header flex shrink-0 flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-6"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Logo size={32} className="shrink-0 text-forest" title="Aqua" />
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="truncate font-serif text-xl text-ink sm:text-2xl"
              >
                {worker ? 'Aqua' : farmName}
              </h1>
              {!worker && onAbout ? (
                <button
                  type="button"
                  onClick={onAbout}
                  aria-label={t('shell.aboutFarm')}
                  title={t('shell.aboutFarm')}
                  className="shrink-0 rounded-full p-2 text-ink-soft hover:bg-cream hover:text-forest"
                >
                  <Info size={16} />
                </button>
              ) : null}
            </div>

            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              {dash ? (
                <>
                  <button
                    type="button"
                    onClick={onToggleAttention}
                    aria-pressed={attentionOn}
                    aria-label={t('shell.attentionOnly')}
                    title={t('shell.attentionOnly')}
                    className={`rounded-full p-2 ${
                      attentionOn
                        ? 'bg-forest text-white'
                        : 'bg-cream text-ink-soft hover:bg-cream-deep'
                    }`}
                  >
                    <ListFilter size={16} />
                  </button>
                  <div className="relative min-w-[8rem] flex-1 sm:w-56 sm:flex-none">
                    <Search
                      size={14}
                      className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-soft"
                      aria-hidden
                    />
                    <label htmlFor={searchId} className="sr-only">
                      {t('shell.searchPlots')}
                    </label>
                    <input
                      id={searchId}
                      type="search"
                      value={search}
                      onChange={(e) => onSearch(e.target.value)}
                      placeholder={t('common.search')}
                      className="w-full rounded-full bg-cream py-2 pe-3 ps-8 text-sm text-ink placeholder:text-ink-soft"
                    />
                  </div>
                </>
              ) : null}
              {(
              <div className="shell-notifications relative">
                <button
                  type="button"
                  aria-label={fresh === 0 ? t('notifications.title') : t('notifications.withCount', { title: t('notifications.title'), total: countLabel('notifications.newCount', fresh) })}
                  aria-expanded={menu === 'bell'}
                  onClick={() => setMenu((m) => (m === 'bell' ? null : 'bell'))}
                  className="relative rounded-full bg-cream p-2 text-ink-soft hover:bg-cream-deep"
                >
                  <Bell size={16} />
                  {fresh > 0 ? (
                    <span className="absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-hanko px-1 text-center text-[10px] leading-4 text-white">
                      {fresh > 9 ? '9+' : String(fresh)}
                    </span>
                  ) : null}
                </button>
                {menu === 'bell' ? (
                  <NotificationsPanel
                    shown={notices.shown}
                    read={notices.read}
                    problems={notices.problems}
                    ready={notices.ready}
                    unread={notices.unread}
                    onMark={notices.markRead}
                    onMarkAll={notices.markAll}
                    onNavigate={() => setMenu(null)}
                  />
                ) : null}
              </div>
              )}
              <div className="shell-account relative">
                <button
                  type="button"
                  aria-label={t('shell.accountMenu')}
                  aria-expanded={menu === 'user'}
                  onClick={() => setMenu((m) => (m === 'user' ? null : 'user'))}
                  className="rounded-full"
                >
                  <Portrait name={user.name || user.email} photo={user.photo} size="sm" />
                </button>
                {menu === 'user' ? (
                  <div
                    role="menu"
                    className="account-popover absolute end-0 z-40 mt-2 w-60 rounded-card border border-line bg-white p-3 shadow-shell"
                  >
                    <p className="font-medium text-ink">{user.name}</p>
                    <p className="truncate text-xs text-ink-soft">{user.email}</p>
                    <p className="mt-2 inline-block rounded-full bg-leaf-soft/70 px-2 py-0.5 text-[11px] font-medium text-forest">
                      {worker ? t('shell.worker') : roleLabel(role)}
                    </p>
                    <a
                      href={VIEW_HREF.profile}
                      role="menuitem"
                      onClick={() => setMenu(null)}
                      className="mt-3 flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-start text-sm text-ink hover:bg-cream"
                    >
                      <UserRound size={14} aria-hidden />
                      {t('shell.profile')}
                    </a>
                    <a
                      href={VIEW_HREF.cv}
                      role="menuitem"
                      onClick={() => setMenu(null)}
                      className="mt-1 flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-start text-sm text-ink hover:bg-cream"
                    >
                      <FileText size={14} aria-hidden />
                      {t('shell.cv')}
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(null)
                        setSwitchTo(worker ? 'farmer' : 'worker')
                      }}
                      className="mt-1 flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-start text-sm text-ink hover:bg-cream"
                    >
                      {worker ? <Tractor size={14} aria-hidden /> : <HardHat size={14} aria-hidden />}
                      {worker ? t('shell.switchFarmer') : t('shell.switchWorker')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={onLogout}
                      className="mt-1 flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-start text-sm text-ink hover:bg-cream"
                    >
                      <LogOut className="rtl:-scale-x-100" size={14} aria-hidden />
                      {t('shell.logout')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <LanguageSwitcher />
          </header>
          <main
            id="main"
            ref={mainRef}
            tabIndex={-1}
            className={
              dash
                ? 'dash-main flex min-h-0 flex-1 flex-col overflow-hidden p-4 sm:p-5'
                : 'flex min-h-0 flex-1 flex-col overflow-hidden'
            }
          >
            {children}
          </main>
        </div>
      </div>
      <SwitchSideDialog
        open={switchTo != null}
        target={switchTo ?? (worker ? 'farmer' : 'worker')}
        onClose={() => setSwitchTo(null)}
        onDone={onUser}
      />
    </div>
  )
}

function RailGroup({
  label,
  padded = false,
  children,
}: {
  label: string
  padded?: boolean
  children: ReactNode
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 items-center gap-1 lg:flex-col"
    >
      <span
        aria-hidden
        className={`hidden text-[10px] font-medium tracking-wide text-ink-soft uppercase lg:block ${
          padded ? 'pt-3 pb-1' : 'pb-1'
        }`}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function unreadAriaLabel(label: string, n: number): string {
  if (n <= 0) return label
  return t('messages.withUnread', { label, unread: countLabel('messages.unread', n) })
}

function RailBtn({
  label,
  active = false,
  onClick,
  href,
  badge = 0,
  badgeText,
  ariaLabel,
  children,
}: {
  label: string
  active?: boolean
  onClick?: () => void
  href?: string
  badge?: number
  badgeText?: string
  ariaLabel?: string
  children: ReactNode
}) {
  const badgeId = useId()
  const showBadge = badge > 0
  const className = `relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
    active ? 'bg-forest-deep text-white' : 'text-ink-soft hover:bg-cream hover:text-forest'
  }`
  const mark = showBadge ? (
    <>
      <span
        className="absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-hanko px-1 text-center text-[10px] leading-4 text-white"
        aria-hidden
      >
        {badge > 9 ? '9+' : String(badge)}
      </span>
      {badgeText ? (
        <span id={badgeId} className="sr-only">
          {badgeText}
        </span>
      ) : null}
    </>
  ) : null
  if (href) {
    return (
      <a
        href={href}
        title={label}
        aria-label={ariaLabel ?? label}
        aria-current={active ? 'page' : undefined}
        aria-describedby={showBadge && badgeText && !ariaLabel ? badgeId : undefined}
        className={className}
      >
        {children}
        {mark}
      </a>
    )
  }
  return (
    <button
      type="button"
      title={label}
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      className={className}
    >
      {children}
      {mark}
    </button>
  )
}
