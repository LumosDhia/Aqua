/** Grapheme clusters so Arabic combining marks and emoji never split. */
export function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(seg.segment(text), (part) => part.segment)
  }
  return Array.from(text)
}

function isIncompleteListMarker(lastLine: string, rest: string): boolean {
  if (lastLine === '-' || lastLine === '*') {
    return rest.startsWith(' ') || rest.startsWith('\t') || rest.startsWith('*')
  }
  if (/^\d+$/.test(lastLine)) return rest.startsWith('.')
  if (/^\d+\.$/.test(lastLine)) return rest.startsWith(' ') || rest.startsWith('\t')
  return false
}

function stripIncompleteList(prefix: string, full: string): string {
  const nl = prefix.lastIndexOf('\n')
  const last = prefix.slice(nl + 1)
  const rest = full.slice(prefix.length)
  if (!isIncompleteListMarker(last, rest)) return prefix
  return nl === -1 ? '' : prefix.slice(0, nl + 1)
}

function stripDanglingToken(prefix: string, full: string): string {
  const rest = full.slice(prefix.length)
  if (prefix.endsWith('*') && rest.startsWith('*')) {
    return stripDanglingToken(prefix.slice(0, -1), full)
  }
  return prefix
}

function closeInline(s: string): string {
  let out = ''
  let i = 0
  while (i < s.length) {
    const ch = s[i]
    if (ch === '`') {
      const close = s.indexOf('`', i + 1)
      if (close === -1) {
        const inner = s.slice(i + 1)
        if (inner.length === 0) break
        out += `\`${inner}\``
        break
      }
      out += s.slice(i, close + 1)
      i = close + 1
      continue
    }
    if (ch === '*' && s[i + 1] === '*') {
      const close = s.indexOf('**', i + 2)
      if (close === -1) {
        const inner = s.slice(i + 2)
        const body = inner.endsWith('*') ? inner.slice(0, -1) : inner
        if (body.length === 0) break
        out += `**${body}**`
        break
      }
      out += s.slice(i, close + 2)
      i = close + 2
      continue
    }
    const cp = s.codePointAt(i)
    if (cp === undefined) break
    const unit = String.fromCodePoint(cp)
    out += unit
    i += unit.length
  }
  return out
}

/** Prefix that FormatMessage can render without half-open `**`, `\``, or list markers. */
export function safeReveal(prefix: string, full: string): string {
  const trimmed = stripDanglingToken(stripIncompleteList(prefix, full), full)
  return closeInline(trimmed)
}
