import type { AboutMode, HerdDraft, PlotDraft, SketchDraft, SourceDraft, WizardStepId } from './model'

export type FarmDraft = {
  key: string
  step: WizardStepId
  farmName: string
  governorate: string
  farmArea: string
  plots: PlotDraft[]
  sources: SourceDraft[]
  herds: HerdDraft[]
  aboutMode: AboutMode | null
  description: string
  sketch: SketchDraft | null
  /** What Aqua read from the about step, for the signature it was read from. */
  read?: ReadState | null
}

export type ReadState = { sig: string; ok: boolean; message: string }

export function draftKey(): string {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(16).padStart(8, '0'),
  ).join('')
}

export function newFarmDraft(): FarmDraft {
  return {
    key: draftKey(),
    step: 'farm',
    farmName: '',
    governorate: '',
    farmArea: '',
    plots: [],
    sources: [],
    herds: [],
    aboutMode: null,
    description: '',
    sketch: null,
    read: null,
  }
}

let database: Promise<IDBDatabase> | undefined

function openDraftDatabase(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('aqua-onboarding', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('farm-drafts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('The draft database is busy.'))
  })
  return database
}

export async function readFarmDraft(userId: number): Promise<FarmDraft | undefined> {
  const db = await openDraftDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction('farm-drafts').objectStore('farm-drafts').get(userId)
    request.onsuccess = () => resolve(request.result as FarmDraft | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function saveFarmDraft(userId: number, draft?: FarmDraft): Promise<void> {
  const db = await openDraftDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('farm-drafts', 'readwrite')
    const store = transaction.objectStore('farm-drafts')
    if (draft) store.put(draft, userId)
    else store.delete(userId)
    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
    transaction.onerror = () => reject(transaction.error)
  })
}
