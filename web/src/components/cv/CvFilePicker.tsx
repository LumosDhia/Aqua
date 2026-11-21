import { t } from '../../i18n'
import { useId, useRef, useState, type DragEvent } from 'react'
import { CV_FILE_ACCEPT, readCvFile } from './model'

type CvFilePickerProps = {
  disabled?: boolean
  onFile: (file: { name: string; data: string }) => void
  onError: (message: string) => void
  label?: string
}

export function CvFilePicker({
  disabled = false,
  onFile,
  onError,
  label = 'Drop a file here or browse',
}: CvFilePickerProps) {
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const depth = useRef(0)

  async function take(files: File[]) {
    const file = files[0]
    if (!file) return
    const result = await readCvFile(file)
    if (!result.ok) {
      onError(result.message)
      return
    }
    onError('')
    onFile({ name: result.name, data: result.data })
  }

  function hasFiles(e: DragEvent) {
    return Array.from(e.dataTransfer.types).includes('Files')
  }

  return (
    <div
      onDragEnter={(e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        depth.current += 1
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (depth.current === 0) return
        e.preventDefault()
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setDragging(false)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(e) => {
        if (!hasFiles(e) || disabled) return
        e.preventDefault()
        depth.current = 0
        setDragging(false)
        void take(Array.from(e.dataTransfer.files))
      }}
      className={`rounded-xl border border-dashed p-6 ${
        dragging ? 'border-ochre bg-ochre/10' : 'border-line bg-cream'
      }`}
    >
      <input
        id={id}
        type="file"
        accept={CV_FILE_ACCEPT}
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
        {dragging ? t('cv.file.drop') : label}
      </label>
      <p className="mt-1 text-center text-xs text-ink-soft">
        {t('cv.file.formats')}
      </p>
    </div>
  )
}
