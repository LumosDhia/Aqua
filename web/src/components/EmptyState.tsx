type EmptyAction =
  | { label: string; href: string }
  | { label: string; onClick: () => void }
  | { label: string; disabledReason: string }

const actionClass = 'mt-3 inline-flex rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest disabled:opacity-60'

export function EmptyState({ text, action }: { text: string; action?: EmptyAction }) {
  return (
    <div data-card="" className="min-w-0 rounded-card border border-line bg-cream px-4 py-6 text-center">
      <p className="text-sm text-ink-soft">{text}</p>
      {action && ('href' in action ? (
        <a href={action.href} className={actionClass}>{action.label}</a>
      ) : 'disabledReason' in action ? (
        <span title={action.disabledReason}>
          <button type="button" disabled title={action.disabledReason} aria-label={`${action.label}. ${action.disabledReason}`} className={actionClass}>
            {action.label}
          </button>
        </span>
      ) : (
        <button type="button" onClick={action.onClick} className={actionClass}>{action.label}</button>
      ))}
    </div>
  )
}
