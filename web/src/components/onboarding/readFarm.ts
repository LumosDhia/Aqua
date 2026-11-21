import { t, activeLocale, countLabel } from '../../i18n'
import type { Crop, PlotBox, SketchRead } from '../../api'
import { draftKey } from './farmDraft'
import { PLOT_MAX, animalLabel, blankPlot, type HerdDraft, type PlotDraft, type SketchDraft } from './model'

/** A short fingerprint of what the farmer gave us, so we only read again when it changes. */
export function readSignature(sketch: SketchDraft | null, description: string, farmAreaM2: number | null): string {
  let hash = 0
  const text = `${sketch ? `${sketch.data.length}:${sketch.data.slice(-64)}` : ''}|${description.trim()}|${farmAreaM2 ?? ''}`
  for (let i = 0; i < text.length; i += 1) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0
  return `${text.length}:${hash}`
}

function listed(parts: string[]): string {
  if (activeLocale() !== 'en') return new Intl.ListFormat(activeLocale()).format(parts)
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function readSummary(result: SketchRead, crops: Crop[]): string {
  const animals = result.animals.map((a) => `${a.count} ${animalLabel(a.species).toLowerCase()}`)
  const named: string[] = []
  for (const plot of result.plots) {
    const label = crops.find((c) => c.id === plot.crop)?.label.toLowerCase()
    if (label && !named.includes(label)) named.push(label)
  }
  const blank = result.plots.filter((p) => !p.crop).length
  const fields = blank ? [countLabel('onboarding.unnamedFields', blank)] : []
  return t('onboarding.detectedSummary', { items: listed([...animals, ...named, ...fields]) })
}

/** The drawing's shape (width and height in pixels), so boxes can keep their proportions. */
export type Aspect = { w: number; h: number }

export function imageAspect(url: string): Promise<Aspect | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0 ? { w: img.naturalWidth, h: img.naturalHeight } : null)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Boxes come from the reader as fractions of the picture's width and height, which are not the same length on a
 * non-square picture. We store them in one unit instead (the picture's longer side = 1) so a tall thin box stays tall
 * and thin wherever it is drawn later.
 */
export function isotropic(box: PlotBox | null | undefined, aspect: Aspect | null): PlotBox | undefined {
  if (!box) return undefined
  if (!aspect) return box
  const longer = Math.max(aspect.w, aspect.h)
  const fx = aspect.w / longer
  const fy = aspect.h / longer
  return { x: box.x * fx, y: box.y * fy, w: box.w * fx, h: box.h * fy }
}

export function plotsFromRead(result: SketchRead, farmAreaM2: number | null, aspect: Aspect | null = null): PlotDraft[] {
  return result.plots.slice(0, PLOT_MAX).map((item) => {
    const row = blankPlot(draftKey(), item.crop ?? '')
    row.name = item.label
    row.fromRead = true
    const box = isotropic(item.box, aspect)
    if (box) row.box = box
    if (farmAreaM2 && item.share != null) row.area = String(Math.max(1, Math.round(item.share * farmAreaM2)))
    return row
  })
}

export function herdsFromRead(result: SketchRead, aspect: Aspect | null = null): HerdDraft[] {
  return result.animals.map((a) => {
    const box = isotropic(a.box, aspect)
    return { species: a.species, count: String(a.count), place: '', fromRead: true, ...(box ? { box } : {}) }
  })
}
