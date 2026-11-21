import { t } from '../../i18n'
/**
 * The farm as an architect's bird's-eye plan: long fields with fine crop rows, orchards of
 * round trees, white buildings with grey roofs, animal pens, water basins, the farm track,
 * the road and the red irrigation main. Drawn from the farm's real data, so it changes as
 * soon as the farmer adds a plot, a water source or animals.
 */
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { FarmAnimals, OverviewPlot, WaterSource } from '../../api'
import { STATUS_COLOR, STATUS_LABEL, moistureColor } from '../../lib/status'
import {
  FIELDS_H,
  PLAN_H,
  PLAN_W,
  ROAD_H,
  ROAD_Y,
  TRACK_Y,
  YARD_H,
  YARD_Y,
  cropLook,
  layoutDrawing,
  drawnHerds,
  layoutYard,
  M,
  neighbourFields,
  planMatrix,
  proj,
  rng,
  rowsIn,
  screenBounds,
  treesIn,
  valveOf,
  type Building,
  type FieldPlan,
  type Pt,
} from './layout'
import './plan.css'

export type PlanColorMode = 'status' | 'moisture' | 'crop'

type Props = {
  plots: OverviewPlot[]
  sources: WaterSource[]
  animals: FarmAnimals | null
  workers: number
  mode: PlanColorMode
  selectedId: number | null
  isDimmed?: (p: OverviewPlot) => boolean
  onSelect: (id: number | null) => void
  onHover?: (id: number | null) => void
}

type Billboard = { y: number; key: string; node: ReactNode }

const pts = (list: Pt[]) => list.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

// ------------------------------------------------------------------ small screen-space drawings

function treeNode(at: Pt, tone: string, size: number, key: string, sway: boolean, delay: number): Billboard {
  return {
    y: at.y,
    key,
    node: (
      <g key={key} transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}>
        <ellipse cx={size * 0.55} cy={size * 0.18} rx={size * 0.95} ry={size * 0.4} fill="rgba(70,82,48,0.2)" />
        <line x1={0} y1={0} x2={0} y2={-size * 0.7} stroke="#8a6c4c" strokeWidth={size * 0.18} strokeLinecap="round" />
        <g className={sway ? 'plan-sway' : undefined} style={sway ? { animationDelay: `${delay}s` } : undefined}>
          <circle cx={0} cy={-size * 1.25} r={size} fill={tone} stroke="rgba(80,90,55,0.35)" strokeWidth={size * 0.08} />
          <circle cx={-size * 0.32} cy={-size * 1.55} r={size * 0.34} fill="rgba(255,255,240,0.28)" />
        </g>
      </g>
    ),
  }
}

function palmNode(at: Pt, tone: string, size: number, key: string): Billboard {
  const fronds = [0, 72, 144, 216, 288]
  return {
    y: at.y,
    key,
    node: (
      <g key={key} transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}>
        <ellipse cx={size * 0.7} cy={size * 0.2} rx={size * 1.1} ry={size * 0.4} fill="rgba(70,82,48,0.2)" />
        <line x1={0} y1={0} x2={0.6} y2={-size * 1.9} stroke="#9a7a55" strokeWidth={size * 0.2} strokeLinecap="round" />
        <g transform={`translate(0.6 ${-size * 1.95})`}>
          {fronds.map((r) => (
            <ellipse key={r} rx={size * 0.95} ry={size * 0.28} transform={`rotate(${r}) translate(${size * 0.6} 0)`} fill={tone} />
          ))}
        </g>
      </g>
    ),
  }
}

function buildingNode(b: Building): Billboard {
  const { x, y, w, h } = b.rect
  const c = [proj({ x, y }), proj({ x: x + w, y }), proj({ x: x + w, y: y + h }), proj({ x, y: y + h })]
  const up = (p: Pt, d: number) => ({ x: p.x, y: p.y - d })
  const H = b.height
  // a wall is seen when its outward side faces the viewer (its projected normal points down the screen)
  const normals: Pt[] = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]
  const faces = (n: Pt) => M.b * n.x + M.d * n.y
  const walls = [0, 1, 2, 3]
    .filter((i) => faces(normals[i]) > 0)
    .map((i) => {
      const p = c[i]
      const q = c[(i + 1) % 4]
      const light = faces(normals[i]) > 0.4
      return { pts: [p, q, up(q, H), up(p, H)], fill: light ? '#f5f3ec' : '#e2ded2', edge: i }
    })
  const along = w >= h
  const r0 = along ? proj({ x, y: y + h / 2 }) : proj({ x: x + w / 2, y })
  const r1 = along ? proj({ x: x + w, y: y + h / 2 }) : proj({ x: x + w / 2, y: y + h })
  const R0 = up(r0, H + b.roof)
  const R1 = up(r1, H + b.roof)
  const top = c.map((p) => up(p, H))
  // the two roof planes (each on one long side) and the two gable triangles (on the short ends)
  const planes = along
    ? [{ pts: [top[0], top[1], R1, R0], n: normals[0] }, { pts: [top[3], top[2], R1, R0], n: normals[2] }]
    : [{ pts: [top[0], top[3], R1, R0], n: normals[3] }, { pts: [top[1], top[2], R1, R0], n: normals[1] }]
  const gables = along
    ? [{ pts: [top[0], top[3], R0], n: normals[3] }, { pts: [top[1], top[2], R1], n: normals[1] }]
    : [{ pts: [top[0], top[1], R0], n: normals[0] }, { pts: [top[3], top[2], R1], n: normals[2] }]
  const front = walls.find((wl) => wl.fill === '#f5f3ec') ?? walls[0]
  const windows = front
    ? [0.25, 0.5, 0.75].map((t) => {
        const [p, q] = front.pts
        const at = (k: number) => ({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k })
        return [up(at(t - 0.06), H * 0.35), up(at(t + 0.06), H * 0.35), up(at(t + 0.06), H * 0.7), up(at(t - 0.06), H * 0.7)]
      })
    : []
  const groundY = Math.max(...c.map((p) => p.y))
  return {
    y: groundY,
    key: b.key,
    node: (
      <g key={b.key} strokeLinejoin="round">
        <polygon points={pts(c.map((p) => ({ x: p.x + 5, y: p.y + 3 })))} fill="rgba(60,70,50,0.18)" />
        {walls.map((wl) => (
          <polygon key={wl.edge} points={pts(wl.pts)} fill={wl.fill} stroke="#8f8f86" strokeWidth={0.8} />
        ))}
        {windows.map((wd, i) => (
          <polygon key={`w${i}`} points={pts(wd)} fill="#7d8a8c" opacity={0.75} />
        ))}
        {gables
          .filter((g) => faces(g.n) > 0)
          .map((g, i) => (
            <polygon key={`g${i}`} points={pts(g.pts)} fill="#efece2" stroke="#8f8f86" strokeWidth={0.8} />
          ))}
        {[...planes]
          .sort((p1, p2) => faces(p1.n) - faces(p2.n))
          .map((pl, i) => (
            <polygon key={`r${i}`} points={pts(pl.pts)} fill={faces(pl.n) > 0 ? '#c3c6bf' : '#a9ada6'} stroke="#8f8f86" strokeWidth={0.8} />
          ))}
        <title>{b.label}</title>
      </g>
    ),
  }
}

const ANIMAL_LOOK: Record<string, { body: string; head: string; rx: number; ry: number }> = {
  dairy_cow: { body: '#f7f5ee', head: '#3a3a36', rx: 4.4, ry: 2.4 },
  beef_cattle: { body: '#8a5a3c', head: '#5e3e2a', rx: 4.4, ry: 2.4 },
  sheep: { body: '#fbfaf4', head: '#3a3a36', rx: 2.8, ry: 2.2 },
  goat: { body: '#c9a57a', head: '#6b5137', rx: 3.2, ry: 1.9 },
  horse: { body: '#8b5e3c', head: '#6b4630', rx: 4.6, ry: 2.1 },
  donkey: { body: '#9a948a', head: '#6c675f', rx: 4, ry: 2 },
  camel: { body: '#d2b07a', head: '#a9895a', rx: 4.6, ry: 2.2 },
  pig: { body: '#efb6a6', head: '#d89585', rx: 3.4, ry: 2.1 },
  chicken: { body: '#ffffff', head: '#c23b2e', rx: 1.4, ry: 1.2 },
  turkey: { body: '#6b4a3a', head: '#c23b2e', rx: 1.8, ry: 1.4 },
  rabbit: { body: '#dcd6ca', head: '#bdb5a6', rx: 1.7, ry: 1.3 },
}

function animalNode(at: Pt, species: string, key: string, bob: boolean, delay: number): Billboard {
  const a = ANIMAL_LOOK[species] ?? ANIMAL_LOOK.sheep
  return {
    y: at.y,
    key,
    node: (
      <g key={key} transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}>
        <ellipse cx={1} cy={a.ry * 0.9} rx={a.rx} ry={a.ry * 0.45} fill="rgba(60,70,50,0.18)" />
        <g className={bob ? 'plan-graze' : undefined} style={bob ? { animationDelay: `${delay}s` } : undefined}>
          <ellipse rx={a.rx} ry={a.ry} fill={a.body} stroke="#6b6b66" strokeWidth={0.45} />
          {species === 'dairy_cow' ? <circle cx={0.8} cy={-0.4} r={1.2} fill="#3a3a36" /> : null}
          {species === 'camel' ? <circle cx={-0.6} cy={-a.ry * 0.9} r={1.3} fill={a.body} stroke="#6b6b66" strokeWidth={0.4} /> : null}
          <circle cx={a.rx + 0.4} cy={-a.ry * 0.35} r={Math.max(0.9, a.ry * 0.55)} fill={a.head} />
        </g>
      </g>
    ),
  }
}

function personNode(at: Pt, key: string): Billboard {
  return {
    y: at.y,
    key,
    node: (
      <g key={key} transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}>
        <ellipse cx={1.5} cy={0.6} rx={2.6} ry={0.9} fill="rgba(60,70,50,0.22)" />
        <rect x={-1.3} y={-6} width={2.6} height={5.6} rx={1} fill="#2f4a6b" />
        <circle cx={0} cy={-7.6} r={1.6} fill="#e8c4a0" />
        <path d="M-2.6 -8.4 L2.6 -8.4 L0 -10.6 Z" fill="#e2c88a" />
      </g>
    ),
  }
}

function waterPointNode(at: Pt, kind: string, name: string, key: string): Billboard {
  let body: ReactNode
  if (kind === 'well') {
    body = (
      <>
        <ellipse cx={0} cy={0} rx={8} ry={3.6} fill="#cfc8b8" stroke="#8f8a7d" strokeWidth={0.7} />
        <ellipse cx={0} cy={-0.6} rx={5} ry={2} fill="#6fa8bd" />
        <line x1={-6} y1={0} x2={-6} y2={-11} stroke="#8a6c4c" strokeWidth={1} />
        <line x1={6} y1={0} x2={6} y2={-11} stroke="#8a6c4c" strokeWidth={1} />
        <path d="M-9 -10 L0 -15 L9 -10 Z" fill="#b3a28a" stroke="#8a7a62" strokeWidth={0.6} />
      </>
    )
  } else if (kind === 'borehole') {
    body = (
      <>
        <rect x={-5} y={-9} width={10} height={9} fill="#f2efe6" stroke="#8f8f86" strokeWidth={0.7} />
        <path d="M-6 -9 L0 -13 L6 -9 Z" fill="#b9bcb6" stroke="#8f8f86" strokeWidth={0.6} />
        <line x1={6} y1={-3} x2={11} y2={-3} stroke="#7a8a92" strokeWidth={1.6} />
        <line x1={11} y1={-3} x2={11} y2={1} stroke="#7a8a92" strokeWidth={1.6} />
      </>
    )
  } else if (kind === 'network') {
    body = (
      <>
        <rect x={-3} y={-10} width={6} height={10} rx={1} fill="#d8d6ce" stroke="#8f8f86" strokeWidth={0.6} />
        <circle cx={0} cy={-7} r={1.6} fill="#6fa8bd" />
      </>
    )
  } else {
    const big = kind === 'tank'
    const r = big ? 9 : 6
    const hgt = big ? 18 : 11
    body = (
      <>
        <rect x={-r} y={-hgt} width={r * 2} height={hgt} fill="#dce9ea" stroke="#7aa0a6" strokeWidth={0.7} />
        <ellipse cx={0} cy={0} rx={r} ry={r * 0.42} fill="#dce9ea" stroke="#7aa0a6" strokeWidth={0.7} />
        <ellipse cx={0} cy={-hgt} rx={r} ry={r * 0.42} fill="#eef5f5" stroke="#7aa0a6" strokeWidth={0.7} />
        <line x1={-r} y1={-hgt * 0.45} x2={r} y2={-hgt * 0.45} stroke="#6fa8bd" strokeWidth={0.8} />
      </>
    )
  }
  return {
    y: at.y,
    key,
    node: (
      <g key={key} transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}>
        <ellipse cx={4} cy={2} rx={10} ry={3.5} fill="rgba(60,70,50,0.16)" />
        {body}
        <text y={13} textAnchor="middle" className="plan-label-small">
          {name}
        </text>
      </g>
    ),
  }
}

// ------------------------------------------------------------------ the scene

export function FarmPlanScene({ plots, sources, animals, workers, mode, selectedId, isDimmed, onSelect, onHover }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const drawing = useMemo(() => layoutDrawing(plots, drawnHerds(animals)), [plots, animals])
  const fields = drawing.fields
  const yard0 = useMemo(() => layoutYard(sources, animals), [sources, animals])
  // pens and barns the farmer drew sit among the fields, next to the ones in the farmyard
  const yard = useMemo(
    () => ({ ...yard0, pens: [...yard0.pens, ...drawing.pens], barns: [...yard0.barns, ...drawing.barns] }),
    [yard0, drawing],
  )
  const box = useMemo(() => screenBounds(), [])

  const billboards = useMemo(() => {
    const list: Billboard[] = []
    // orchards and palms
    for (const f of fields) {
      const look = cropLook(f.plot.crop)
      if (look.kind !== 'orchard' && look.kind !== 'palms') continue
      const r = rng(f.plot.id * 97 + 3)
      const tones = look.tree ?? ['#9fbc6c']
      const size = Math.max(3.2, Math.min(6.2, look.spacing * 0.24))
      treesIn(f.rect, look.spacing, f.plot.id).forEach((p, i) => {
        const at = proj(p)
        const tone = tones[Math.floor(r() * tones.length)]
        list.push(
          look.kind === 'palms'
            ? palmNode(at, tone, size, `t-${f.plot.id}-${i}`)
            : treeNode(at, tone, size, `t-${f.plot.id}-${i}`, i % 3 === 0, (i % 7) * 0.6),
        )
      })
    }
    // windbreak trees around the farmhouse and along the road
    const wr = rng(11)
    for (let i = 0; i < 14; i += 1) {
      const p = i < 8 ? { x: 14 + wr() * 20, y: YARD_Y + 10 + i * 19 } : { x: 160 + (i - 8) * 70 + wr() * 20, y: ROAD_Y - 8 }
      list.push(treeNode(proj(p), ['#8fae5f', '#a6bf76', '#7ea25a'][i % 3], 7, `wb-${i}`, i % 2 === 0, i * 0.4))
    }
    if (yard.meadow) {
      const mr = rng(77)
      treesIn(yard.meadow, 30, 77).forEach((p, i) => {
        if (mr() < 0.55) list.push(treeNode(proj(p), ['#a9c27a', '#d9b28f', '#c7c98a', '#94b46a'][i % 4], 6, `m-${i}`, i % 3 === 0, i * 0.3))
      })
    }
    list.push(buildingNode(yard.house))
    for (const b of yard.barns) list.push(buildingNode(b))
    for (const w of yard.water) {
      if (w.kind === 'point') list.push(waterPointNode(proj(w.at), w.source.kind, w.source.name, `w-${w.source.id}`))
    }
    // animals inside their pens
    for (const pen of yard.pens) {
      const r = rng(pen.place.length * 31 + pen.rect.x)
      let n = 0
      for (const group of pen.animals) {
        const show = Math.min(group.count, 22)
        for (let i = 0; i < show; i += 1) {
          const p = { x: pen.rect.x + 12 + r() * (pen.rect.w - 24), y: pen.rect.y + 44 + r() * (pen.rect.h - 54) }
          list.push(animalNode(proj(p), group.species, `a-${pen.place}-${group.species}-${i}`, n % 2 === 0, (n % 5) * 0.7))
          n += 1
        }
      }
    }
    // a few workers in the biggest fields
    const wk = rng(5)
    const big = [...fields].sort((a, b) => b.rect.w * b.rect.h - a.rect.w * a.rect.h)
    for (let i = 0; i < Math.min(workers, 6) && big.length; i += 1) {
      const f = big[i % big.length]
      list.push(personNode(proj({ x: f.rect.x + f.rect.w * (0.25 + wk() * 0.5), y: f.rect.y + f.rect.h * (0.3 + wk() * 0.5) }), `p-${i}`))
    }
    // irrigation valves where the main reaches each field
    for (const f of fields) {
      const v = proj(valveOf(f.rect))
      list.push({
        y: v.y,
        key: `v-${f.plot.id}`,
        node: <circle key={`v-${f.plot.id}`} cx={v.x} cy={v.y} r={2.4} fill="#d9774f" stroke="#fff" strokeWidth={0.8} />,
      })
    }
    return list.sort((a, b) => a.y - b.y)
  }, [fields, yard, workers])

  const tint = (p: OverviewPlot): string | null => {
    if (mode === 'crop') return null
    if (mode === 'moisture') return p.soil_moisture == null ? '#8a8478' : moistureColor(p.soil_moisture)
    return p.status === 'ok' ? null : STATUS_COLOR[p.status]
  }

  const key = (e: KeyboardEvent, id: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(selectedId === id ? null : id)
    }
  }

  const setH = (id: number | null) => {
    setHover(id)
    onHover?.(id)
  }

  const mainLine = (() => {
    if (!yard.mainSource || !fields.length) return null
    const xs = fields.map((f) => valveOf(f.rect).x).concat(yard.mainSource.x)
    return { from: Math.min(...xs), to: Math.max(...xs) }
  })()

  const focus = selectedId ?? hover

  return (
    <svg style={{ direction: 'ltr' }}
      viewBox={`${box.minX.toFixed(0)} ${box.minY.toFixed(0)} ${box.w.toFixed(0)} ${box.h.toFixed(0)}`}
      preserveAspectRatio="xMidYMid meet"
      className="plan-svg h-full w-full"
      role="group"
      aria-label={t('dashboard.planAlt')}
    >
      <defs>
        <pattern id="plan-grass" width="9" height="9" patternUnits="userSpaceOnUse">
          <rect width="9" height="9" fill="#e1e8cb" />
          <circle cx="2" cy="3" r="0.7" fill="#cfdab0" />
          <circle cx="6.5" cy="7" r="0.6" fill="#d6dfba" />
        </pattern>
        <pattern id="plan-pasture" width="7" height="7" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill="#d9e3b4" />
          <circle cx="3" cy="3" r="0.6" fill="#c5d39c" />
        </pattern>
        {fields.map((f) => (
          <clipPath key={f.plot.id} id={`plan-clip-${f.plot.id}`}>
            <rect x={f.rect.x} y={f.rect.y} width={f.rect.w} height={f.rect.h} />
          </clipPath>
        ))}
      </defs>

      {/* everything flat on the ground is drawn in plan space and tilted as one */}
      <g transform={planMatrix(0, 0)}>
        <rect x={-700} y={-700} width={PLAN_W + 1400} height={PLAN_H + 1400} fill="#e4e8d0" />
        {neighbourFields().map((n, i) => (
          <g key={`nb-${i}`} opacity={0.7}>
            <rect x={n.rect.x} y={n.rect.y} width={n.rect.w} height={n.rect.h} fill={n.tone} stroke="#c3d2b4" strokeWidth={2} />
            <path
              d={rowsIn(n.rect, n.spacing * 1.6).map(([a, b]) => `M${a.x.toFixed(0)} ${a.y.toFixed(0)}L${b.x.toFixed(0)} ${b.y.toFixed(0)}`).join('')}
              stroke="#d3cfa6"
              strokeWidth={0.6}
              opacity={0.55}
            />
          </g>
        ))}
        <rect x={-40} y={-40} width={PLAN_W + 100} height={PLAN_H + 60} fill="url(#plan-grass)" />
        <rect x={-6} y={-6} width={PLAN_W + 12} height={FIELDS_H + 12} fill="#b9d0b0" rx={4} />
        {/* road and farm track */}
        <rect x={-40} y={ROAD_Y} width={PLAN_W + 100} height={ROAD_H} fill="#e9e8e1" stroke="#c9c7bd" strokeWidth={1} />
        <line x1={-40} y1={ROAD_Y + ROAD_H / 2} x2={PLAN_W + 60} y2={ROAD_Y + ROAD_H / 2} stroke="#d4d2c7" strokeWidth={1.2} strokeDasharray="14 10" />
        <rect x={-10} y={TRACK_Y - 6} width={PLAN_W + 20} height={12} fill="#efebdf" stroke="#d9d3c1" strokeWidth={0.8} />
        <rect x={120} y={TRACK_Y + 6} width={14} height={ROAD_Y - TRACK_Y - 6} fill="#efebdf" stroke="#d9d3c1" strokeWidth={0.8} />
        {/* the farmyard ground */}
        <rect x={0} y={YARD_Y} width={PLAN_W} height={YARD_H} fill="#e6ebd2" stroke="#c8d3b2" strokeWidth={1} rx={6} />
        {/* water: canal and basins */}
        {yard.water.map((w) =>
          w.kind === 'point' ? null : (
            <g key={`wg-${w.source.id}`}>
              <rect x={w.rect.x} y={w.rect.y} width={w.rect.w} height={w.rect.h} fill="#a7cfca" stroke="#78afa8" strokeWidth={1.5} rx={2} />
              {w.kind === 'basin'
                ? Array.from({ length: Math.floor(w.rect.w / 18) }, (_, i) => (
                    <line key={i} className="plan-shimmer" x1={w.rect.x + 9 + i * 18} y1={w.rect.y + 4} x2={w.rect.x + 9 + i * 18} y2={w.rect.y + w.rect.h - 4} stroke="#c7e4df" strokeWidth={1} />
                  ))
                : null}
            </g>
          ),
        )}
        {yard.meadow ? <rect x={yard.meadow.x} y={yard.meadow.y} width={yard.meadow.w} height={yard.meadow.h} fill="url(#plan-pasture)" opacity={0.8} rx={6} /> : null}
        {/* animal pens */}
        {yard.pens.map((p) => (
          <rect key={`pen-${p.place}`} x={p.rect.x} y={p.rect.y} width={p.rect.w} height={p.rect.h} fill="url(#plan-pasture)" stroke="#9b8a6a" strokeWidth={1.4} strokeDasharray="5 3" rx={4} />
        ))}
        {/* fields */}
        {fields.map((f) => (
          <Field
            key={f.plot.id}
            f={f}
            tint={tint(f.plot)}
            dim={isDimmed?.(f.plot) ?? false}
            focused={focus === f.plot.id}
            onClick={() => onSelect(selectedId === f.plot.id ? null : f.plot.id)}
            onKeyDown={(e) => key(e, f.plot.id)}
            onEnter={() => setH(f.plot.id)}
            onLeave={() => setH(null)}
          />
        ))}
        {/* the irrigation main along the farm track, and a branch to each field */}
        {mainLine ? (
          <g stroke="#d9774f" strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.92}>
            <line x1={mainLine.from} y1={TRACK_Y} x2={mainLine.to} y2={TRACK_Y} />
            {yard.mainSource ? <line x1={yard.mainSource.x} y1={TRACK_Y} x2={yard.mainSource.x} y2={YARD_Y + 30} /> : null}
            {fields
              .filter((f) => f.rect.y + f.rect.h >= FIELDS_H - 14)
              .map((f) => {
                const v = valveOf(f.rect)
                return <line key={f.plot.id} x1={v.x} y1={v.y} x2={v.x} y2={TRACK_Y} />
              })}
          </g>
        ) : null}
      </g>

      {/* standing things, drawn back to front */}
      <g className="plan-billboards">{billboards.map((b) => b.node)}</g>

      {/* soft cloud shadows drifting over the farm */}
      <g className="plan-clouds" pointerEvents="none">
        <ellipse cx={box.minX + box.w * 0.2} cy={box.minY + box.h * 0.35} rx={box.w * 0.22} ry={box.h * 0.09} fill="rgba(40,60,45,0.035)" />
        <ellipse cx={box.minX + box.w * 0.7} cy={box.minY + box.h * 0.6} rx={box.w * 0.18} ry={box.h * 0.07} fill="rgba(40,60,45,0.03)" />
      </g>

      {/* status pins and the focused field's name */}
      <g pointerEvents="none">
        {fields.map((f) => {
          const c = proj({ x: f.rect.x + f.rect.w / 2, y: f.rect.y + f.rect.h / 2 })
          const color = STATUS_COLOR[f.plot.status]
          const isFocus = focus === f.plot.id
          return (
            <g key={f.plot.id} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`} opacity={isDimmed?.(f.plot) ? 0.35 : 1}>
              <line x1={0} y1={0} x2={0} y2={-14} stroke="#55624f" strokeWidth={1} />
              <circle cx={0} cy={-17} r={isFocus ? 6.5 : 5} fill={color} stroke="#fff" strokeWidth={2} />
              {isFocus ? (
                <g transform="translate(0 -30)">
                  <rect x={-90} y={-17} width={180} height={30} rx={15} fill="rgba(255,253,246,0.96)" stroke="#d9d2bd" />
                  <text textAnchor="middle" y={3} className="plan-label">
                    {f.plot.name} · {STATUS_LABEL[f.plot.status]}
                  </text>
                </g>
              ) : null}
            </g>
          )
        })}
      </g>
    </svg>
  )
}

function Field({
  f,
  tint,
  dim,
  focused,
  onClick,
  onKeyDown,
  onEnter,
  onLeave,
}: {
  f: FieldPlan
  tint: string | null
  dim: boolean
  focused: boolean
  onClick: () => void
  onKeyDown: (e: KeyboardEvent) => void
  onEnter: () => void
  onLeave: () => void
}) {
  const look = cropLook(f.plot.crop)
  const { x, y, w, h } = f.rect
  const rows = look.kind === 'rows' || look.kind === 'grain' || look.kind === 'vines' ? rowsIn(f.rect, look.spacing) : []
  const label = `${f.plot.name}, ${f.plot.crop_label}, ${STATUS_LABEL[f.plot.status]}${f.plot.soil_moisture != null ? `, soil ${Math.round(f.plot.soil_moisture)}%` : ''}`
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={focused}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      className="plan-field"
      opacity={dim ? 0.35 : 1}
    >
      <rect x={x} y={y} width={w} height={h} fill={look.fill} stroke={focused ? '#0f3329' : '#a9c3a1'} strokeWidth={focused ? 3 : 1.5} />
      <g clipPath={`url(#plan-clip-${f.plot.id})`}>
        {rows.length ? (
          <path
            d={rows.map(([a, b]) => `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`).join('')}
            stroke={look.line}
            strokeWidth={look.kind === 'vines' ? 1.6 : look.kind === 'grain' ? 0.7 : 1.1}
            strokeDasharray={look.kind === 'vines' ? '3 2' : undefined}
            fill="none"
          />
        ) : null}
        {tint ? <rect x={x} y={y} width={w} height={h} fill={tint} opacity={0.22} /> : null}
      </g>
      <title>{label}</title>
    </g>
  )
}
