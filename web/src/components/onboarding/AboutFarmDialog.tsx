import { t } from '../../i18n'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { ApiError, api } from '../../api'
import { formatHa, formatInt } from '../../lib/status'
import { DESC_MAX } from './model'
import { readSketch, SKETCH_ACCEPT } from './sketch'

type AboutFarmDialogProps = {
  open: boolean
  farmId: number
  description: string
  governorate: string
  areaM2: number | null
  hasSketch: boolean
  canEdit: boolean
  onClose: () => void
  onUpdated: (next: { description: string; has_sketch: boolean }) => void
}

export function AboutFarmDialog({
  open,
  farmId,
  description,
  governorate,
  areaM2,
  hasSketch,
  canEdit,
  onClose,
  onUpdated,
}: AboutFarmDialogProps) {
  const titleId = useId()
  const descId = useId()
  const fileId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(description)
  const [preview, setPreview] = useState<string | null>(null)
  const [newData, setNewData] = useState<string | null>(null)
  const [removed, setRemoved] = useState(false)
  const [loadSketch, setLoadSketch] = useState(false)
  const [sketchErr, setSketchErr] = useState('')
  const [dropping, setDropping] = useState(false)
  const loadedUrl = useRef<string | null>(null)
  const [fileErr, setFileErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setEditing(false)
    setText(description)
    setNewData(null)
    setRemoved(false)
    setFileErr('')
    setErr('')
    setBusy(false)
    setSketchErr('')
  }, [open, description, farmId])

  useEffect(() => {
    if (!open) {
      setPreview(null)
      loadedUrl.current = null
      return
    }
    if (!hasSketch) {
      setPreview(null)
      loadedUrl.current = null
      setLoadSketch(false)
      return
    }
    let cancelled = false
    let url: string | null = null
    setLoadSketch(true)
    setSketchErr('')
    api
      .farmSketch(farmId)
      .then((blob) => {
        if (cancelled) return
        url = URL.createObjectURL(blob)
        loadedUrl.current = url
        setPreview(url)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setPreview(null)
        setSketchErr(error instanceof ApiError ? error.message : t('dashboard.drawingError'))
      })
      .finally(() => {
        if (!cancelled) setLoadSketch(false)
      })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [open, farmId, hasSketch])

  useEffect(() => {
    if (!open) return
    const root = panelRef.current
    const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const pick = () =>
      root
        ? [
            ...root.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ]
        : []
    const first = pick()[0]
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !root) return
      const els = pick()
      if (els.length === 0) return
      const i = els.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey) {
        if (i <= 0) {
          e.preventDefault()
          els[els.length - 1]?.focus()
        }
      } else if (i === els.length - 1) {
        e.preventDefault()
        els[0]?.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus()
    }
  }, [open, editing])

  async function onFile(files: File[]) {
    const file = files[0]
    if (!file) return
    setFileErr('')
    const result = await readSketch(file)
    if (!result.ok) {
      setFileErr(result.message)
      return
    }
    setPreview((prev) => {
      if (prev && prev.startsWith('blob:') && prev !== loadedUrl.current) {
        URL.revokeObjectURL(prev)
      }
      return result.previewUrl
    })
    setNewData(result.data)
    setRemoved(false)
  }

  function removeDrawing() {
    setFileErr('')
    setPreview((prev) => {
      if (prev && prev.startsWith('blob:') && prev !== loadedUrl.current) {
        URL.revokeObjectURL(prev)
      }
      return null
    })
    setNewData(null)
    setRemoved(true)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (text.length > DESC_MAX) {
      setErr(t('common.descriptionLimit'))
      return
    }
    setBusy(true)
    setErr('')
    try {
      const about = await api.updateFarmAbout(farmId, text.trim())
      let sketchOn = about.has_sketch
      if (newData) {
        await api.uploadFarmSketch(farmId, newData)
        sketchOn = true
      } else if (removed && hasSketch) {
        await api.deleteFarmSketch(farmId)
        sketchOn = false
      }
      onUpdated({ description: about.description, has_sketch: sketchOn })
      setEditing(false)
      setNewData(null)
      setRemoved(false)
    } catch (error) {
      setErr(error instanceof ApiError ? error.message : t('dashboard.saveError'))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const showImage = preview != null
  const empty = !description.trim() && !hasSketch && !showImage

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-forest-deep/45"
        aria-label={t('common.closeDialog')}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-card border border-line bg-paper p-6 shadow-shell"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-serif text-2xl text-ink">
            {t('shell.aboutFarm')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-ink-soft hover:bg-cream"
            aria-label={t('common.close')}
          >
            <X size={18} />
          </button>
        </div>

        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {governorate ? <div><dt className="text-ink-soft">{t('common.governorate')}</dt><dd>{governorate}</dd></div> : null}
          {areaM2 != null ? (
            <div>
              <dt className="text-ink-soft">{t('farm.area')}</dt>
              <dd>{formatHa(areaM2, 8)} ha</dd>
            </div>
          ) : null}
        </dl>

        {editing ? (
          <form className="mt-4 space-y-3" onSubmit={(e) => void submit(e)}>
            <div>
              <label htmlFor={descId} className="text-xs font-medium text-ink-soft">
                {t('common.description')}
              </label>
              <textarea
                id={descId}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={DESC_MAX}
                rows={5}
                disabled={busy}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
              <p className="mt-1 text-end text-xs text-ink-soft">
                {formatInt(text.length)}/{formatInt(DESC_MAX)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-soft">{t('dashboard.drawing')}</p>
              {showImage ? (
                <div className="mt-1 overflow-hidden rounded-card border border-line bg-cream p-2">
                  <img
                    src={preview}
                    alt={t('dashboard.farmDrawing')}
                    className="mx-auto max-h-56 object-contain"
                  />
                  <button
                    type="button"
                    onClick={removeDrawing}
                    disabled={busy}
                    className="mt-2 rounded-full border border-line px-3 py-1 text-xs"
                  >
                    {t('dashboard.removeDrawing')}
                  </button>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    if (busy || !Array.from(e.dataTransfer.types).includes('Files')) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'copy'
                    setDropping(true)
                  }}
                  onDragLeave={() => setDropping(false)}
                  onDrop={(e) => {
                    if (busy || !Array.from(e.dataTransfer.types).includes('Files')) return
                    e.preventDefault()
                    setDropping(false)
                    void onFile(Array.from(e.dataTransfer.files))
                  }}
                  className={`mt-1 rounded-xl border border-dashed p-4 ${dropping ? 'border-ochre bg-ochre/10' : 'border-line bg-cream'}`}
                >
                  <input
                    id={fileId}
                    type="file"
                    accept={SKETCH_ACCEPT}
                    disabled={busy}
                    onChange={(e) => {
                      const list = e.target.files
                      if (list) void onFile(Array.from(list))
                      e.target.value = ''
                    }}
                    className="sr-only"
                  />
                  <label
                    htmlFor={fileId}
                    className="block cursor-pointer text-center text-sm text-ink"
                  >
                    {dropping ? t('dashboard.dropPicture') : t('dashboard.browsePicture')}
                  </label>
                  <p className="mt-1 text-center text-xs text-ink-soft">
                    {t('dashboard.pictureLimit')}
                  </p>
                </div>
              )}
              {fileErr ? (
                <p className="mt-1 text-sm text-hanko" role="alert">
                  {fileErr}
                </p>
              ) : null}
            </div>
            {err ? (
              <p className="text-sm text-hanko" role="alert">
                {err}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false)
                  setText(description)
                  setNewData(null)
                  setRemoved(false)
                  setErr('')
                  setFileErr('')
                  setPreview(hasSketch ? loadedUrl.current : null)
                }}
                className="rounded-full border border-line px-4 py-2 text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 space-y-3">
            {description.trim() ? (
              <p className="whitespace-pre-wrap text-sm text-ink">{description}</p>
            ) : (
              <p className="text-sm text-ink-soft">{t('dashboard.noDescription')}</p>
            )}
            {loadSketch ? (
              <div className="aqua-skel h-40 rounded-card" aria-hidden />
            ) : showImage ? (
              <img
                src={preview}
                alt={t('dashboard.farmDrawing')}
                className="mx-auto max-h-64 w-full rounded-card border border-line object-contain bg-cream"
              />
            ) : null}
            {sketchErr ? (
              <p className="text-sm text-hanko" role="alert">
                {sketchErr}
              </p>
            ) : null}
            {empty && canEdit ? (
              <p className="text-sm text-ink-soft">{t('dashboard.describeOrDraw')}</p>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-full bg-forest-deep px-4 py-2 text-sm font-medium text-white"
              >
                {t('common.edit')}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}
