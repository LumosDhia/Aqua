import { type ReactNode } from 'react'
import { isAdminUser, type User } from '../api'
import { ChatPanel } from '../components/ChatPanel'
import { CvPanel } from '../components/CvPanel'
import { JobsPanel } from '../components/JobsPanel'
import { MessagesPanel } from '../components/MessagesPanel'
import { ProfilePanel } from '../components/ProfilePanel'
import { AdminReportsPanel } from '../components/reports/AdminReportsPanel'
import { Shell } from '../components/Shell'
import { WorkerHome } from '../components/WorkerHome'
import { useUnreadMessages } from '../lib/useUnreadMessages'
import { useView, workerView } from '../lib/view'

type WorkerAppProps = {
  user: User
  onLogout: () => void
  onUser: (user: User) => void
}

export function WorkerApp({ user, onLogout, onUser }: WorkerAppProps) {
  const { view } = useView()
  const screen = workerView(view)
  const unread = useUnreadMessages()

  let main: ReactNode
  if (screen === 'chat') {
    main = <><ChatPanel worker farmId={0} farmName="Your jobs, applications and profile" role={user.role} plots={[]} loading={false} /></>
  } else if (screen === 'jobs') {
    main = <JobsPanel farmId={null} role={user.role} farmRegion="" workerMode />
  } else if (screen === 'messages') {
    main = <MessagesPanel side="worker" onUnreadChange={unread.refresh} />
  } else if (screen === 'profile') {
    main = <ProfilePanel />
  } else if (screen === 'cv') {
    main = <CvPanel />
  } else if (screen === 'admin') {
    main = <AdminReportsPanel allowed={isAdminUser(user)} />
  } else {
    main = <WorkerHome user={user} onUser={onUser} />
  }

  return (
    <Shell
    key={user.id}
      mode="worker"
      farmName="Aqua"
      attentionOn={false}
      onToggleAttention={noop}
      search=""
      onSearch={noop}
      user={user}
      role={user.role}
      onLogout={onLogout}
      onUser={onUser}
      messagesBadge={unread.total}
    >
      {main}
    </Shell>
  )
}

function noop(): void {}
