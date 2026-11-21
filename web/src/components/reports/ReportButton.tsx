import { t } from '../../i18n'
import { useState } from 'react'
import { Flag } from 'lucide-react'
import { ReportDialog } from './ReportDialog'

export function ReportButton({ targetUserId, targetName = 'this person', engagementId }: {
  targetUserId: number
  targetName?: string
  engagementId?: number | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink">
        <Flag size={14} aria-hidden /> {' '}{t('reports.report')}
      </button>
      <ReportDialog open={open} targetUserId={targetUserId} targetName={targetName} engagementId={engagementId} onClose={() => setOpen(false)} />
    </>
  )
}
