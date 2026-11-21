export type TreemapInput = {
  id: number
  area: number
}

export type TreemapRect = {
  id: number
  x: number
  y: number
  w: number
  h: number
}

function worst(row: number[], side: number): number {
  if (row.length === 0 || side <= 0) return Infinity
  let s = 0
  let rmax = 0
  let rmin = Infinity
  for (const v of row) {
    s += v
    if (v > rmax) rmax = v
    if (v < rmin) rmin = v
  }
  if (s <= 0 || rmin <= 0) return Infinity
  const side2 = side * side
  const s2 = s * s
  return Math.max((side2 * rmax) / s2, s2 / (side2 * rmin))
}

function layoutRow(
  ids: number[],
  values: number[],
  x: number,
  y: number,
  w: number,
  h: number,
): { rects: TreemapRect[]; nx: number; ny: number; nw: number; nh: number } {
  const s = values.reduce((a, b) => a + b, 0)
  const rects: TreemapRect[] = []
  if (w <= h) {
    const stripH = w > 0 ? s / w : 0
    let cx = x
    for (let i = 0; i < ids.length; i++) {
      const rw = stripH > 0 ? values[i] / stripH : 0
      rects.push({ id: ids[i], x: cx, y, w: rw, h: stripH })
      cx += rw
    }
    return { rects, nx: x, ny: y + stripH, nw: w, nh: h - stripH }
  }
  const stripW = h > 0 ? s / h : 0
  let cy = y
  for (let i = 0; i < ids.length; i++) {
    const rh = stripW > 0 ? values[i] / stripW : 0
    rects.push({ id: ids[i], x, y: cy, w: stripW, h: rh })
    cy += rh
  }
  return { rects, nx: x + stripW, ny: y, nw: w - stripW, nh: h }
}

export function squarifiedTreemap(
  items: TreemapInput[],
  width: number,
  height: number,
  gap = 8,
  minSize = 28,
): TreemapRect[] {
  if (items.length === 0 || width <= 0 || height <= 0) return []

  const sorted = [...items].sort((a, b) => b.area - a.area)
  const containerArea = width * height
  const raw = sorted.map((it) => Math.max(it.area, 1))
  const rawSum = raw.reduce((a, b) => a + b, 0)
  // Boost tiny plots so they stay clickable, then scale the set back to the panel.
  const minArea = minSize * minSize
  const boosted = raw.map((v) => Math.max((v / rawSum) * containerArea, minArea))
  const boostSum = boosted.reduce((a, b) => a + b, 0)
  const values = boosted.map((v) => (v / boostSum) * containerArea)
  const ids = sorted.map((it) => it.id)

  const rects: TreemapRect[] = []
  let x = 0
  let y = 0
  let w = width
  let h = height
  let start = 0
  const rowIds: number[] = []
  const rowVals: number[] = []

  const flush = () => {
    if (rowIds.length === 0) return
    const laid = layoutRow(rowIds, rowVals, x, y, w, h)
    rects.push(...laid.rects)
    x = laid.nx
    y = laid.ny
    w = laid.nw
    h = laid.nh
    rowIds.length = 0
    rowVals.length = 0
  }

  while (start < ids.length) {
    if (w <= 0.5 || h <= 0.5) break
    const side = Math.min(w, h)
    const trial = [...rowVals, values[start]]
    if (rowVals.length === 0 || worst(trial, side) <= worst(rowVals, side)) {
      rowIds.push(ids[start])
      rowVals.push(values[start])
      start += 1
    } else {
      flush()
    }
  }
  flush()

  const half = gap / 2
  return rects.map((r) => ({
    id: r.id,
    x: r.x + half,
    y: r.y + half,
    w: Math.max(r.w - gap, 2),
    h: Math.max(r.h - gap, 2),
  }))
}
