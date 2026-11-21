import { t } from '../../i18n'
import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { Check, PenLine, PencilRuler, X } from 'lucide-react'
import { formatInt } from '../../lib/status'
import { DESC_MAX, type AboutMode, type SketchDraft } from './model'
import { readSketch, SKETCH_ACCEPT } from './sketch'

export function StepAbout({
  mode,
  description,
  sketch,
  busy,
  onMode,
  onDescription,
  onSketch,
  onReadingSketch,
  parsing = false,
  readFailure = '',
}: {
  mode: AboutMode | null
  description: string
  sketch: SketchDraft | null
  busy: boolean
  onMode: (mode: AboutMode) => void
  onDescription: (value: string) => void
  onSketch: (next: SketchDraft | null) => void
  onReadingSketch: (reading: boolean) => void
  parsing?: boolean
  readFailure?: string
}) {
  const descId = useId()
  const drawDescId = useId()
  const fileId = useId()
  const drawFileId = useId()
  const exampleId = useId()
  const counter = `${formatInt(description.length)}/${formatInt(DESC_MAX)}`
  const [reading, setReading] = useState(false)
  const locked = busy || reading || parsing

  function setSketchReading(value: boolean) {
    setReading(value)
    onReadingSketch(value)
  }

  return (
    <div className="space-y-4">
      {reading ? <p role="status" className="text-sm text-ink-soft">{t('onboarding.drawingReading')}</p> : null}
      {parsing ? <p role="status" className="text-sm text-ink-soft">{t('onboarding.descriptionReading')}</p> : null}
      {readFailure ? (
        <p role="status" className="rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink">
          {readFailure} {' '}{t('onboarding.manualAfterError')}
        </p>
      ) : null}
      <div
        role="radiogroup"
        aria-label={t('onboarding.aboutMode')}
        onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
          if (
            e.key !== 'ArrowRight' &&
            e.key !== 'ArrowLeft' &&
            e.key !== 'ArrowDown' &&
            e.key !== 'ArrowUp'
          ) {
            return
          }
          e.preventDefault()
          onMode(mode === 'describe' ? 'draw' : 'describe')
        }}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        <ModeCard
          pressed={mode === 'describe'}
          disabled={locked}
          icon={PenLine}
          title={t('onboarding.describeFarm')}
          help={t('onboarding.describeHelp')}
          onSelect={() => onMode('describe')}
        />
        <ModeCard
          pressed={mode === 'draw'}
          disabled={locked}
          icon={PencilRuler}
          title={t('onboarding.drawFarm')}
          help={t('onboarding.drawHelp')}
          onSelect={() => onMode('draw')}
        />
      </div>

      {mode === 'describe' ? (
        <div className="space-y-3">
          <div>
            <label htmlFor={descId} className="text-xs font-medium text-ink-soft">
              {t('common.description')}
            </label>
            <textarea
              id={descId}
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={5}
              disabled={locked}
              placeholder={t('onboarding.exampleFarm')}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-soft"
            />
            <p className="mt-1 text-end text-xs text-ink-soft">{counter}</p>
          </div>
          <SketchPicker
            id={fileId}
            label={t('onboarding.addDrawing')}
            sketch={sketch}
            disabled={locked}
            onSketch={onSketch}
            onReading={setSketchReading}
          />
        </div>
      ) : null}

      {mode === 'draw' ? (
        <div className="space-y-3">
          <figure
            data-card=""
            className="overflow-hidden rounded-card border border-line bg-cream p-3"
          >
            <img
              src="/img/farm-sketch-example.svg"
              alt={t('onboarding.exampleDrawingAlt')}
              className="mx-auto max-h-36 w-full object-contain sm:max-h-44"
            />
            <figcaption id={exampleId} className="mt-2 text-xs text-ink-soft">
              {t('onboarding.exampleDrawing')}
            </figcaption>
          </figure>
          <SketchPicker
            id={drawFileId}
            label={t('onboarding.drawing')}
            sketch={sketch}
            disabled={locked}
            droppable
            onSketch={onSketch}
            onReading={setSketchReading}
          />
          <div>
            <label htmlFor={drawDescId} className="text-xs font-medium text-ink-soft">
              {t('onboarding.drawingExtra')}
            </label>
            <textarea
              id={drawDescId}
              value={description}
              onChange={(e) => onDescription(e.target.value)}
              maxLength={DESC_MAX}
              rows={3}
              disabled={locked}
              className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
            />
            <p className="mt-1 text-end text-xs text-ink-soft">{counter}</p>
          </div>
        </div>
      ) : null}

    </div>
  )
}

function ModeCard({
  pressed,
  disabled,
  icon: Icon,
  title,
  help,
  onSelect,
}: {
  pressed: boolean
  disabled: boolean
  icon: typeof PenLine
  title: string
  help: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={pressed}
      disabled={disabled}
      onClick={onSelect}
      data-card=""
      className={`rounded-card border px-4 py-3 text-start ${
        pressed ? 'border-forest bg-leaf-soft/40' : 'border-line bg-white hover:bg-cream'
      }`}
    >
      <span className="flex items-center gap-2 font-serif text-lg text-ink">
        <span
          aria-hidden
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            pressed ? 'bg-forest text-white' : 'bg-cream text-forest'
          }`}
        >
          {pressed ? <Check size={18} /> : <Icon size={18} />}
        </span>
        {title}
      </span>
      <span className="mt-1 block text-xs text-ink-soft">{help}</span>
    </button>
  )
}

function SketchPicker({
  id,
  label,
  sketch,
  disabled,
  droppable = true,
  onSketch,
  onReading,
}: {
  id: string
  label: string
  sketch: SketchDraft | null
  disabled: boolean
  droppable?: boolean
  onSketch: (next: SketchDraft | null) => void
  onReading: (reading: boolean) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [fileErr, setFileErr] = useState('')
  const depth = useRef(0)
  const reading = useRef(false)

  async function take(files: File[]) {
    const file = files[0]
    if (!file || disabled || reading.current) return
    reading.current = true
    onReading(true)
    setFileErr('')
    try {
      const result = await readSketch(file)
      if (!result.ok) {
        setFileErr(result.message)
        return
      }
      onSketch({ data: result.data, previewUrl: result.previewUrl, name: result.name })
    } finally {
      reading.current = false
      onReading(false)
    }
  }

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      {sketch ? (
        <div className="mt-1 overflow-hidden rounded-card border border-line bg-cream p-2">
          <img
            src={sketch.previewUrl}
            alt={t('onboarding.drawingAlt')}
            className="mx-auto max-h-40 object-contain"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-ink-soft">{sketch.name}</p>
            <button
              type="button"
              onClick={() => {
                setFileErr('')
                onSketch(null)
              }}
              disabled={disabled}
              className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-xs"
            >
              <X size={12} aria-hidden />
              {t('common.remove')}
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={
            droppable
              ? (e) => {
                  if (!hasFiles(e)) return
                  e.preventDefault()
                  depth.current += 1
                  setDragging(true)
                }
              : undefined
          }
          onDragLeave={
            droppable
              ? (e) => {
                  if (depth.current === 0) return
                  e.preventDefault()
                  depth.current = Math.max(0, depth.current - 1)
                  if (depth.current === 0) setDragging(false)
                }
              : undefined
          }
          onDragOver={
            droppable
              ? (e) => {
                  if (!hasFiles(e)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                }
              : undefined
          }
          onDrop={
            droppable
              ? (e) => {
                  if (!hasFiles(e)) return
                  e.preventDefault()
                  depth.current = 0
                  setDragging(false)
                  void take(Array.from(e.dataTransfer.files))
                }
              : undefined
          }
          className={`mt-1 rounded-xl border border-dashed p-4 ${
            dragging ? 'border-ochre bg-ochre/10' : 'border-line bg-cream'
          }`}
        >
          <input
            id={id}
            type="file"
            accept={SKETCH_ACCEPT}
            disabled={disabled}
            onChange={(e) => {
              const list = e.target.files
              if (list) void take(Array.from(list))
              e.target.value = ''
            }}
            className="sr-only"
          />
          <label
            htmlFor={id}
            className={`block text-center text-sm ${
              disabled ? 'cursor-not-allowed text-ink-soft' : 'cursor-pointer text-ink'
            }`}
          >
            {droppable
              ? dragging
                ? t('dashboard.dropPicture')
                : t('dashboard.browsePicture')
              : t('onboarding.choosePicture')}
          </label>
          <p className="mt-1 text-center text-xs text-ink-soft">{t('dashboard.pictureLimit')}</p>
        </div>
      )}
      {fileErr ? (
        <p className="mt-1 text-sm text-hanko" role="alert">
          {fileErr}
        </p>
      ) : null}
    </div>
  )
}

