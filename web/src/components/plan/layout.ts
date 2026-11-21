import { t } from '../../i18n'
/**
 * Farm plan layout: turns the farm's real data (plots and their areas, water sources,
 * animal places, workers) into a plan in flat coordinates, then projects it into the
 * tilted bird's-eye view used by the drawing. Everything is deterministic: the same farm
 * always draws the same way, and it redraws itself whenever the farm changes.
 */
import type { FarmAnimals, OverviewPlot, PlotBox, WaterSource } from '../../api'

export type Rect = { x: number; y: number; w: number; h: number }
export type Pt = { x: number; y: number }

// plan space: fields on top, the farmyard band below them, the road along the bottom
export const PLAN_W = 1000
export const FIELDS_H = 520
export const TRACK_Y = FIELDS_H + 14 // the farm track between the fields and the yard
export const YARD_Y = FIELDS_H + 30
export const YARD_H = 170
export const ROAD_Y = YARD_Y + YARD_H + 14
export const ROAD_H = 28
export const PLAN_H = ROAD_Y + ROAD_H

const GUTTER = 12 // green ditch between fields

// tilted view: rotate the plan, then flatten it, like an architect's bird's-eye drawing
const ANGLE = (-60 * Math.PI) / 180 // fields run steeply bottom-left to top-right, the yard sits bottom-left
const FLATTEN = 0.6
export const M = {
  a: Math.cos(ANGLE),
  b: FLATTEN * Math.sin(ANGLE),
  c: -Math.sin(ANGLE),
  d: FLATTEN * Math.cos(ANGLE),
}

export function proj(p: Pt): Pt {
  return { x: M.a * p.x + M.c * p.y, y: M.b * p.x + M.d * p.y }
}

export function planMatrix(tx: number, ty: number): string {
  return `matrix(${M.a} ${M.b} ${M.c} ${M.d} ${tx} ${ty})`
}

/** A small seeded random generator so trees and animals stay in the same place on every draw. */
export function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

// ---------------------------------------------------------------- fields (squarified treemap)

type Item = { id: number; weight: number }

function worst(row: Item[], side: number, scale: number): number {
  const areas = row.map((r) => r.weight * scale)
  const sum = areas.reduce((a, b) => a + b, 0)
  const max = Math.max(...areas)
  const min = Math.min(...areas)
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

function squarify(items: Item[], box: Rect): Map<number, Rect> {
  const out = new Map<number, Rect>()
  const total = items.reduce((a, b) => a + b.weight, 0)
  if (!items.length || total <= 0) return out
  const scale = (box.w * box.h) / total
  let rest = [...items]
  let free = { ...box }
  while (rest.length) {
    const side = Math.min(free.w, free.h)
    const row: Item[] = [rest[0]]
    let i = 1
    while (i < rest.length && worst([...row, rest[i]], side, scale) <= worst(row, side, scale)) {
      row.push(rest[i])
      i += 1
    }
    rest = rest.slice(i)
    const rowArea = row.reduce((a, b) => a + b.weight * scale, 0)
    if (free.w >= free.h) {
      const w = rowArea / free.h
      let y = free.y
      for (const r of row) {
        const h = (r.weight * scale) / w
        out.set(r.id, { x: free.x, y, w, h })
        y += h
      }
      free = { x: free.x + w, y: free.y, w: free.w - w, h: free.h }
    } else {
      const h = rowArea / free.w
      let x = free.x
      for (const r of row) {
        const w = (r.weight * scale) / h
        out.set(r.id, { x, y: free.y, w, h })
        x += w
      }
      free = { x: free.x, y: free.y + h, w: free.w, h: free.h - h }
    }
  }
  return out
}

export type FieldPlan = { plot: OverviewPlot; rect: Rect }

function usableBox(plot: OverviewPlot): PlotBox | null {
  const b = plot.box
  if (!b) return null
  const [x, y, w, h] = [b.x, b.y, b.w, b.h]
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null
  const cx = Math.min(Math.max(x, 0), 1)
  const cy = Math.min(Math.max(y, 0), 1)
  const cw = Math.min(w, 1 - cx)
  const ch = Math.min(h, 1 - cy)
  return cw > 0.005 && ch > 0.005 ? { x: cx, y: cy, w: cw, h: ch } : null
}

function inset(c: Rect, gutter = GUTTER): Rect {
  const g = gutter / 2
  return { x: c.x + g, y: c.y + g, w: Math.max(8, c.w - gutter), h: Math.max(8, c.h - gutter) }
}

const DRAWN_GUTTER = 4 // drawn boxes keep the gaps of the drawing, so only a thin edge is taken off each

/** An animal pen the farmer drew on their drawing: one herd, at the place it was drawn. */
export type DrawnHerd = { id: number; species: string; count: number; place: string; box: PlotBox }

export function drawnHerds(animals: FarmAnimals | null): DrawnHerd[] {
  const out: DrawnHerd[] = []
  for (const g of animals?.groups ?? []) {
    for (const p of g.places) {
      const box = p.box ? usableBox({ box: p.box } as OverviewPlot) : null
      if (box) out.push({ id: p.herd_id, species: g.species, count: p.count, place: p.place, box })
    }
  }
  return out
}

export type DrawingPlan = {
  fields: FieldPlan[]
  pens: Pen[]
  barns: Building[]
  /** the one scale (plan units per drawing unit) used for every box, or null when nothing was drawn */
  scale: number | null
}

/**
 * Fields and animal pens drawn by the farmer keep the drawing. Every box goes through ONE scale for both axes, so
 * each box keeps its proportions and the gaps between boxes keep theirs; the whole drawing is centred in the field
 * area and what is left over stays ground. (The drawing's down runs along the plan's long axis, so after the
 * bird's-eye tilt the drawing still reads top to bottom and left to right.) Fields without a drawn box are laid out
 * by area in a strip below the drawing.
 */
export function layoutDrawing(plots: OverviewPlot[], herds: DrawnHerd[] = []): DrawingPlan {
  const drawn = plots.map((p) => ({ plot: p, box: usableBox(p) })).filter((d): d is { plot: OverviewPlot; box: PlotBox } => d.box != null)
  const loose = plots.filter((p) => !drawn.some((d) => d.plot.id === p.id))
  const hasDrawing = drawn.length > 0
  const looseH = hasDrawing && loose.length ? Math.round(FIELDS_H * 0.28) : hasDrawing ? 0 : FIELDS_H
  const fields: FieldPlan[] = []
  const pens: Pen[] = []
  const barns: Building[] = []
  let scale: number | null = null

  if (hasDrawing) {
    const regionH = FIELDS_H - looseH
    const boxes = [...drawn.map((d) => d.box), ...herds.map((h) => h.box)]
    const minX = Math.min(...boxes.map((b) => b.x))
    const minY = Math.min(...boxes.map((b) => b.y))
    const spanX = Math.max(0.01, Math.max(...boxes.map((b) => b.x + b.w)) - minX)
    const spanY = Math.max(0.01, Math.max(...boxes.map((b) => b.y + b.h)) - minY)
    // the drawing's x runs down the plan (its length is regionH), its y runs across the plan (its length is PLAN_W)
    const s = Math.min(regionH / spanX, PLAN_W / spanY)
    scale = s
    const offX = (PLAN_W - spanY * s) / 2
    const offY = (regionH - spanX * s) / 2
    const place = (b: PlotBox): Rect => ({
      x: offX + (spanY - (b.y - minY) - b.h) * s,
      y: offY + (b.x - minX) * s,
      w: b.h * s,
      h: b.w * s,
    })
    for (const { plot, box } of drawn) fields.push({ plot, rect: inset(place(box), DRAWN_GUTTER) })
    for (const herd of herds) {
      const rect = inset(place(herd.box), DRAWN_GUTTER)
      const key = `drawn-${herd.id}`
      pens.push({ place: key, rect, animals: [{ species: herd.species, count: herd.count }] })
      barns.push({ key: `barn-${key}`, rect: { x: rect.x + 6, y: rect.y + 6, w: Math.min(56, rect.w - 12), h: Math.min(30, rect.h / 3) }, height: 15, roof: 10, label: `${herd.place || t('farm.animal')} barn` })
    }
  }

  if (loose.length) {
    // softened areas: big fields stay bigger, but a small vegetable patch is still visible
    const items = [...loose]
      .sort((a, b) => b.area_m2 - a.area_m2 || a.id - b.id)
      .map((p) => ({ id: p.id, weight: Math.pow(Math.max(p.area_m2, 50), 0.82) }))
    const cells = squarify(items, { x: 0, y: FIELDS_H - looseH, w: PLAN_W, h: looseH })
    for (const p of loose) {
      const c = cells.get(p.id)
      if (c) fields.push({ plot: p, rect: inset(c) })
    }
  }
  return { fields, pens, barns, scale }
}

// ---------------------------------------------------------------- crops

export type CropLook = {
  kind: 'rows' | 'grain' | 'orchard' | 'palms' | 'vines'
  fill: string
  line: string
  spacing: number
  tree?: string[]
}

const ORCHARD_TONES = ['#9fbc6c', '#b6c97f', '#8fae5f', '#c8cf87']

export function cropLook(crop: string): CropLook {
  switch (crop) {
    case 'wheat':
      return { kind: 'grain', fill: '#e9dca6', line: '#cdb96f', spacing: 3.2 }
    case 'barley':
      return { kind: 'grain', fill: '#e4dcae', line: '#c2b77b', spacing: 3.6 }
    case 'potatoes':
      return { kind: 'rows', fill: '#e6dcc0', line: '#a99a6b', spacing: 6 }
    case 'tomatoes':
    case 'peppers':
    case 'onions':
      return { kind: 'rows', fill: '#dfe6b8', line: '#93ad66', spacing: 5.5 }
    case 'grapes':
      return { kind: 'vines', fill: '#e3e7c6', line: '#6f8f4e', spacing: 8 }
    case 'olives':
      return { kind: 'orchard', fill: '#e2e7c5', line: '#cdd5a7', spacing: 24, tree: ['#9db07a', '#aebd88', '#8ea46d'] }
    case 'almonds':
      return { kind: 'orchard', fill: '#e6e6c9', line: '#d2d4ad', spacing: 22, tree: ['#d9a7a0', '#e3bfa9', '#c9b37e', '#b9c487'] }
    case 'citrus':
      return { kind: 'orchard', fill: '#e1e8c2', line: '#cdd7a5', spacing: 20, tree: ['#7fa35a', '#93b465', '#e2b85c'] }
    case 'dates':
      return { kind: 'palms', fill: '#ece3c4', line: '#d8cda4', spacing: 30, tree: ['#7c9a52', '#6d8b48'] }
    default:
      return { kind: 'orchard', fill: '#e2e7c5', line: '#cdd5a7', spacing: 24, tree: ORCHARD_TONES }
  }
}

/** Positions of orchard trees inside a field, in plan space, on a lightly jittered grid. */
export function treesIn(rect: Rect, spacing: number, seed: number): Pt[] {
  const r = rng(seed)
  const pts: Pt[] = []
  const pad = Math.min(8, rect.w / 4, rect.h / 4)
  for (let y = rect.y + pad + spacing / 2; y < rect.y + rect.h - pad; y += spacing) {
    for (let x = rect.x + pad + spacing / 2; x < rect.x + rect.w - pad; x += spacing) {
      pts.push({ x: x + (r() - 0.5) * spacing * 0.3, y: y + (r() - 0.5) * spacing * 0.3 })
    }
  }
  return pts.slice(0, 260)
}

/** Parallel crop rows along the field's long side, as line segments in plan space. */
export function rowsIn(rect: Rect, spacing: number): [Pt, Pt][] {
  const lines: [Pt, Pt][] = []
  const inset = 3
  if (rect.w >= rect.h) {
    for (let y = rect.y + inset; y <= rect.y + rect.h - inset; y += spacing) {
      lines.push([{ x: rect.x + inset, y }, { x: rect.x + rect.w - inset, y }])
    }
  } else {
    for (let x = rect.x + inset; x <= rect.x + rect.w - inset; x += spacing) {
      lines.push([{ x, y: rect.y + inset }, { x, y: rect.y + rect.h - inset }])
    }
  }
  return lines.slice(0, 220)
}

// ---------------------------------------------------------------- farmyard

export type Building = { key: string; rect: Rect; height: number; roof: number; label: string }
export type Pen = { place: string; rect: Rect; animals: { species: string; count: number }[] }
export type WaterPlan =
  | { kind: 'basin'; rect: Rect; source: WaterSource }
  | { kind: 'canal'; rect: Rect; source: WaterSource }
  | { kind: 'point'; at: Pt; source: WaterSource }

export type YardPlan = {
  house: Building
  barns: Building[]
  pens: Pen[]
  water: WaterPlan[]
  mainSource: Pt | null
  meadow: Rect | null
}

export function layoutYard(sources: WaterSource[], animals: FarmAnimals | null): YardPlan {
  const house: Building = { key: 'house', rect: { x: 40, y: YARD_Y + 60, w: 92, h: 52 }, height: 22, roof: 14, label: t('farm.farmhouse') }
  const barns: Building[] = [
    { key: 'shed', rect: { x: 150, y: YARD_Y + 96, w: 58, h: 36 }, height: 16, roof: 10, label: t('farm.shed') },
  ]

  // animal pens, one per place where animals are kept, side by side after the house
  const byPlace = new Map<string, { species: string; count: number }[]>()
  for (const g of animals?.groups ?? []) {
    for (const p of g.places) {
      if (p.box) continue // drawn on the farmer's drawing: it is placed with the fields
      const list = byPlace.get(p.place) ?? []
      list.push({ species: g.species, count: p.count })
      byPlace.set(p.place, list)
    }
  }
  const pens: Pen[] = []
  let x = 240
  for (const [place, list] of [...byPlace.entries()].slice(0, 4)) {
    const total = list.reduce((a, b) => a + b.count, 0)
    const w = Math.min(190, 90 + Math.sqrt(total) * 9)
    pens.push({ place, rect: { x, y: YARD_Y + 18, w, h: YARD_H - 40 }, animals: list })
    barns.push({ key: `barn-${place}`, rect: { x: x + 6, y: YARD_Y + 22, w: Math.min(56, w - 20), h: 30 }, height: 15, roof: 10, label: `${place} barn` })
    x += w + 18
  }

  // water: big reservoirs as basins, a canal along the side, everything else as small structures
  const water: WaterPlan[] = []
  let bx = x + 10
  let mainSource: Pt | null = null
  const points: WaterSource[] = []
  for (const s of sources) {
    if (s.kind === 'canal') {
      water.push({ kind: 'canal', rect: { x: PLAN_W + 6, y: 0, w: 14, h: FIELDS_H + 20 }, source: s })
      mainSource ??= { x: PLAN_W + 4, y: TRACK_Y }
    } else if ((s.kind === 'tank' || s.kind === 'rain_tank') && (s.capacity_l ?? 0) >= 100000 && bx < PLAN_W - 90) {
      const rect = { x: bx, y: YARD_Y + 24, w: 110, h: YARD_H - 52 }
      water.push({ kind: 'basin', rect, source: s })
      mainSource ??= { x: rect.x + rect.w / 2, y: TRACK_Y }
      bx += 126
    } else {
      points.push(s)
    }
  }
  // wells, boreholes and small tanks stand together after the pens and basins
  let px = bx + 20
  points.forEach((s, i) => {
    const at = { x: Math.min(px + Math.floor(i / 2) * 52, PLAN_W - 30), y: YARD_Y + (i % 2 === 0 ? 60 : 118) }
    water.push({ kind: 'point', at, source: s })
    mainSource ??= { x: at.x, y: TRACK_Y }
  })
  if (points.length) px += Math.ceil(points.length / 2) * 52 + 10
  const meadow: Rect | null = px < PLAN_W - 60 ? { x: px, y: YARD_Y + 10, w: PLAN_W - px - 10, h: YARD_H - 20 } : null
  return { house, barns, pens, water, mainSource, meadow }
}

/** Where the irrigation line enters each field: the point of its edge closest to the farm track. */
export function valveOf(rect: Rect): Pt {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h }
}

/** The screen box of the whole plan, so the drawing can be fitted into its panel. */
/** Faint fields of the neighbours around the farm, so the drawing fills its frame like a real aerial plan. */
export function neighbourFields(): { rect: Rect; tone: string; spacing: number }[] {
  const r = rng(42)
  const out: { rect: Rect; tone: string; spacing: number }[] = []
  const tones = ['#e7e2bf', '#e2e7c8', '#e9e0b8', '#dfe6c4']
  const ring: Rect[] = [
    { x: -620, y: -620, w: 2240, h: 560 }, // beyond the top
    { x: -620, y: -60, w: 560, h: PLAN_H + 700 }, // left
    { x: PLAN_W + 60, y: -60, w: 560, h: PLAN_H + 700 }, // right
    { x: -60, y: PLAN_H + 40, w: PLAN_W + 120, h: 600 }, // below the road
  ]
  for (const band of ring) {
    const wide = band.w >= band.h
    let t = wide ? band.x : band.y
    const end = wide ? band.x + band.w : band.y + band.h
    while (t < end) {
      const size = 90 + r() * 160
      const rect = wide
        ? { x: t, y: band.y, w: Math.min(size, end - t) - 12, h: band.h }
        : { x: band.x, y: t, w: band.w, h: Math.min(size, end - t) - 12 }
      out.push({ rect, tone: tones[Math.floor(r() * tones.length)], spacing: 3 + r() * 4 })
      t += size
    }
  }
  return out
}

export function screenBounds(pad = 6): { minX: number; minY: number; w: number; h: number } {
  const corners = [
    { x: -8, y: -8 },
    { x: PLAN_W + 24, y: -8 },
    { x: -8, y: PLAN_H + 4 },
    { x: PLAN_W + 24, y: PLAN_H + 4 },
  ].map(proj)
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const minX = Math.min(...xs) - pad
  const minY = Math.min(...ys) - pad - 22 // room above for roofs and trees
  return { minX, minY, w: Math.max(...xs) - minX + pad, h: Math.max(...ys) - minY + pad }
}
