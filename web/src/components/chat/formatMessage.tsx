import type { ReactNode } from 'react'

const UL = /^[-*]\s+/
const OL = /^\d+\.\s+/

function inlineParts(text: string, extra?: ReactNode): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  let k = 0
  const inline = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let m: RegExpExecArray | null = inline.exec(text)
  while (m) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) {
      parts.push(
        <code
          key={k}
          className="rounded bg-cream-deep px-1 py-0.5 text-[0.85em] text-forest-deep"
        >
          {tok.slice(1, -1)}
        </code>,
      )
    } else {
      parts.push(<strong key={k}>{tok.slice(2, -2)}</strong>)
    }
    k += 1
    last = m.index + tok.length
    m = inline.exec(text)
  }
  if (last < text.length) parts.push(text.slice(last))
  if (extra) parts.push(extra)
  return parts
}

type Block =
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string }

export function FormatMessage({
  text,
  caret = false,
}: {
  text: string
  caret?: boolean
}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const start = lines[i]
    if (start === undefined) break
    if (start.trim() === '') {
      i += 1
      continue
    }

    if (UL.test(start)) {
      const items: string[] = []
      while (i < lines.length) {
        const row = lines[i]
        if (row === undefined || !UL.test(row)) break
        items.push(row.replace(UL, ''))
        i += 1
      }
      blocks.push({ kind: 'ul', items })
      continue
    }

    if (OL.test(start)) {
      const items: string[] = []
      while (i < lines.length) {
        const row = lines[i]
        if (row === undefined || !OL.test(row)) break
        items.push(row.replace(OL, ''))
        i += 1
      }
      blocks.push({ kind: 'ol', items })
      continue
    }

    const para: string[] = []
    while (i < lines.length) {
      const row = lines[i]
      if (row === undefined || row.trim() === '' || UL.test(row) || OL.test(row)) break
      para.push(row)
      i += 1
    }
    blocks.push({ kind: 'p', text: para.join('\n') })
  }

  const mark = caret ? <span key="caret" className="aqua-caret" aria-hidden /> : null

  if (blocks.length === 0) {
    if (!mark) return null
    return <div className="text-base leading-relaxed">{mark}</div>
  }

  const last = blocks.length - 1
  const nodes = blocks.map((block, k) => {
    const end = k === last ? mark : undefined
    if (block.kind === 'ul') {
      return (
        <ul key={k} className="list-disc space-y-1 pl-4">
          {block.items.map((it, j) => (
            <li key={j}>
              {inlineParts(it, end && j === block.items.length - 1 ? end : undefined)}
            </li>
          ))}
        </ul>
      )
    }
    if (block.kind === 'ol') {
      return (
        <ol key={k} className="list-decimal space-y-1 pl-4">
          {block.items.map((it, j) => (
            <li key={j}>
              {inlineParts(it, end && j === block.items.length - 1 ? end : undefined)}
            </li>
          ))}
        </ol>
      )
    }
    return (
      <p key={k} className="whitespace-pre-wrap break-words">
        {inlineParts(block.text, end)}
      </p>
    )
  })

  return <div className="space-y-2 text-base leading-relaxed">{nodes}</div>
}
