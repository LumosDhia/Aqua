import { t } from '../i18n'
import { EnteredBy } from './EnteredBy'
import { useEffect, useId, useState } from 'react'
import { Download, Pencil, Sparkles, Trash2, Upload } from 'lucide-react'
import { ApiError, api, isAbortError, type CvData, type MyCv } from '../api'
import { formatInt } from '../lib/status'
import { CvEditor } from './cv/CvEditor'
import { CvFilePicker } from './cv/CvFilePicker'
import { CvFlow } from './cv/CvFlow'
import {
  CV_FIX_MAX,
  CV_FIX_MIN,
  asCvSource,
  normalizeCv,
} from './cv/model'
import { CvPreview } from './CvPreview'
import { PageFrame } from './PageFrame'

type Mode = 'view' | 'edit' | 'fix' | 'upload'

export function CvPanel() {
  const [mine, setMine] = useState<MyCv | null>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const [retryTick, setRetryTick] = useState(0)
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState<CvData | null>(null)
  const [fix, setFix] = useState('')
  const [understood, setUnderstood] = useState('')
  const [unsure, setUnsure] = useState<string[]>([])
  const [changes, setChanges] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiOff, setAiOff] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const fixId = useId()

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setErr('')
    api
      .myCv()
      .then((cv) => {
        if (cancelled) return
        setMine(cv)
        setErr('')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setMine(null)
        setErr(e instanceof ApiError ? e.message : t('cv.loadError'))
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    api
      .profileMe()
      .then((p) => {
        if (!cancelled) setPhoto(p.photo)
      })
      .catch(() => {
        if (!cancelled) setPhoto(null)
      })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  function reload() {
    setMode('view')
    setDraft(null)
    setFix('')
    setUnderstood('')
    setUnsure([])
    setChanges('')
    setAiOff(false)
    setConfirmRemove(false)
    setRetryTick((n) => n + 1)
  }

  function openEdit() {
    if (!mine?.cv) return
    setErr('')
    setDraft(normalizeCv(mine.cv))
    setMode('edit')
  }

  function openFix() {
    if (!mine?.cv) return
    setErr('')
    setAiOff(false)
    setFix('')
    setUnderstood('')
    setUnsure([])
    setChanges('')
    setDraft(normalizeCv(mine.cv))
    setMode('fix')
  }

  async function saveDraft() {
    if (!draft) return
    setBusy(true)
    setErr('')
    try {
      const saved = await api.saveCv(draft, asCvSource(mine?.source))
      try {
        await api.applyCvToProfile()
      } catch {
        /* profile fill is optional after a successful save */
      }
      setMine(saved)
      setMode('view')
      setDraft(null)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('cv.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function sendFix() {
    if (!draft) return
    const instruction = fix.trim()
    if (instruction.length < CV_FIX_MIN) {
      setErr(t('common.charactersMinimum', { minimum: formatInt(CV_FIX_MIN) }))
      return
    }
    if (instruction.length > CV_FIX_MAX) {
      setErr(t('common.charactersMaximum', { maximum: formatInt(CV_FIX_MAX) }))
      return
    }
    setBusy(true)
    setErr('')
    setAiOff(false)
    try {
      const status = await api.aiStatus()
      if (!status.configured) {
        setAiOff(true)
        setErr(t('cv.aiUnavailable'))
        return
      }
      const out = await api.refineCv(draft, instruction)
      setDraft(normalizeCv(out.proposed))
      setUnderstood(out.understood)
      setUnsure(out.unsure.filter((s) => s.trim()))
      setChanges(out.changes)
      setFix('')
    } catch (e) {
      if (isAbortError(e)) return
      if (e instanceof ApiError && e.status === 503) {
        setAiOff(true)
        setErr(e.message || t('cv.aiUnavailable'))
      } else {
        setErr(e instanceof ApiError ? e.message : t('cv.updateError'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function uploadFile(file: { name: string; data: string }) {
    setBusy(true)
    setErr('')
    try {
      const info = await api.uploadCvFile(file.name, file.data)
      setMine((prev) =>
        prev
          ? {
              ...prev,
              has_file: true,
              file_name: info.file_name,
              file_type: info.file_type,
            }
          : prev,
      )
      setMode('view')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('cv.file.uploadError'))
    } finally {
      setBusy(false)
    }
  }

  async function downloadFile() {
    setErr('')
    try {
      const blob = await api.cvFile()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = mine?.file_name?.trim() || 'cv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('cv.file.downloadError'))
    }
  }

  async function removeFile() {
    setBusy(true)
    setErr('')
    try {
      await api.deleteCvFile()
      setMine((prev) =>
        prev ? { ...prev, has_file: false, file_name: null, file_type: null } : prev,
      )
      setConfirmRemove(false)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t('cv.file.removeError'))
    } finally {
      setBusy(false)
    }
  }

  const hasCv = Boolean(mine?.cv)
  const editing = mode === 'edit' || mode === 'fix' || mode === 'upload'
  const showFlow = ready && !hasCv && !err
  const contained = showFlow || editing

  return (
    <PageFrame
      label={t('shell.cv')}
      busy={!ready || busy}
      body={contained ? 'contain' : 'scroll'}
      header={
        <header className="border-b border-line px-4 py-3 sm:px-6">
          <h2 tabIndex={-1} className="font-serif text-lg leading-tight text-ink sm:text-xl">
            {t('shell.cv')}
          </h2>
          <p className="text-xs text-ink-soft">{t('cv.subtitle')}</p>
        </header>
      }
    >
      {err ? (
        <div
          role="alert"
          className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-card border border-hanko/30 bg-hanko/10 px-4 py-3 text-sm text-ink"
        >
          <p>{err}</p>
          {aiOff && (mode === 'fix' || mode === 'edit') ? (
            <button
              type="button"
              onClick={() => {
                setErr('')
                setAiOff(false)
                setMode('edit')
              }}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('cv.manualSelf')}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setErr('')
                setRetryTick((n) => n + 1)
              }}
              className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      ) : null}

      {!ready ? (
        <div className="space-y-3" aria-hidden>
          <div className="aqua-skel h-8 w-1/3 rounded-xl" />
          <div className="aqua-skel h-40 rounded-card" />
        </div>
      ) : showFlow ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <CvFlow onDone={reload} photo={photo} />
        </div>
      ) : hasCv && mine?.cv && mode === 'edit' && draft ? (
        <EditorPane
          title={t('cv.edit')}
          draft={draft}
          busy={busy}
          onChange={setDraft}
          onCancel={() => {
            setMode('view')
            setDraft(null)
            setErr('')
          }}
          onSave={() => void saveDraft()}
        />
      ) : hasCv && mine?.cv && mode === 'fix' && draft ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell">
          <header className="shrink-0 border-b border-line px-4 py-3 sm:px-6">
            <h3 className="font-serif text-lg text-ink">{t('cv.editText')}</h3>
          </header>
          <div className="page-scroll min-h-0 flex-1 space-y-3 px-4 py-3 sm:px-6">
            {understood.trim() ? (
              <section
                data-card=""
                className="rounded-card border border-leaf/40 bg-leaf-soft/50 p-3"
              >
                <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                  {t('cv.understood')}
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm break-words text-ink">
                  {understood}
                </p>
              </section>
            ) : null}
            {unsure.length > 0 ? (
              <section
                data-card=""
                className="rounded-card border border-ochre/40 bg-ochre-soft/40 p-3"
              >
                <h4 className="text-xs font-medium tracking-wide text-ink-soft uppercase">
                  {t('cv.unsure')}
                </h4>
                <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink">
                  {unsure.map((item, i) => (
                    <li key={`${item}-${i}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {changes.trim() ? (
              <p className="text-sm text-forest" role="status">
                {t('cv.changed')}{' '} {changes}
              </p>
            ) : null}
            <CvEditor value={draft} onChange={setDraft} disabled={busy} />
            <div data-card="" className="rounded-card border border-line bg-cream p-3">
              <label htmlFor={fixId} className="text-xs font-medium text-ink-soft">
                {t('cv.askFix')}
              </label>
              <textarea
                id={fixId}
                value={fix}
                onChange={(e) => setFix(e.target.value.slice(0, CV_FIX_MAX))}
                maxLength={CV_FIX_MAX}
                disabled={busy}
                dir="auto"
                rows={3}
                className="mt-1 w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-ink-soft">
                  {formatInt(fix.length)}/{formatInt(CV_FIX_MAX)}
                </p>
                <button
                  type="button"
                  onClick={() => void sendFix()}
                  disabled={busy}
                  className="rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  {t('cv.fix')}
                </button>
              </div>
            </div>
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => {
                setMode('view')
                setDraft(null)
                setErr('')
              }}
              disabled={busy}
              className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={busy}
              className="rounded-full bg-forest-deep px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? t('common.saving') : t('cv.save')}
            </button>
          </footer>
        </div>
      ) : hasCv && mine?.cv && mode === 'upload' ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell">
          <header className="shrink-0 border-b border-line px-4 py-3 sm:px-6">
            <h3 className="font-serif text-lg text-ink">{t('cv.file.replace')}</h3>
          </header>
          <div className="page-scroll min-h-0 flex-1 px-4 py-3 sm:px-6">
            <CvFilePicker disabled={busy} onFile={(file) => void uploadFile(file)} onError={setErr} />
          </div>
          <footer className="flex shrink-0 justify-end border-t border-line px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => {
                setMode('view')
                setErr('')
              }}
              disabled={busy}
              className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
            >
              {t('common.cancel')}
            </button>
          </footer>
        </div>
      ) : hasCv && mine?.cv ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openEdit}
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-deep px-4 py-1.5 text-xs font-medium text-white"
            >
              <Pencil size={14} aria-hidden />
              {t('cv.edit')}
            </button>
            <button
              type="button"
              onClick={openFix}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-ink"
            >
              <Sparkles size={14} aria-hidden />
              {t('cv.editText')}
            </button>
            <button
              type="button"
              onClick={() => {
                setErr('')
                setMode('upload')
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-ink"
            >
              <Upload size={14} aria-hidden />
              {t('cv.file.replace')}
            </button>
            {mine.has_file ? (
              <>
                <button
                  type="button"
                  onClick={() => void downloadFile()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-ink"
                >
                  <Download size={14} aria-hidden />
                  {t('cv.file.download')}
                </button>
                {confirmRemove ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-ink-soft">{t('cv.file.removeConfirm')}</span>
                    <button
                      type="button"
                      onClick={() => void removeFile()}
                      disabled={busy}
                      className="inline-flex items-center gap-1 rounded-full bg-hanko px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      <Trash2 size={12} aria-hidden />
                      {t('common.remove')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(false)}
                      disabled={busy}
                      className="rounded-full border border-line px-3 py-1.5 text-xs disabled:opacity-60"
                    >
                      {t('cv.file.keep')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemove(true)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-4 py-1.5 text-xs font-medium text-ink"
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('cv.file.remove')}
                  </button>
                )}
              </>
            ) : null}
          </div>
          {mine.has_file && mine.file_name ? (
            <p className="text-xs text-ink-soft">{t('cv.file.label')}{' '} {mine.file_name}</p>
          ) : null}
          <EnteredBy record={mine} own />
          <CvPreview cv={mine.cv} photo={photo} />
        </div>
      ) : null}
    </PageFrame>
  )
}

function EditorPane({
  title,
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  title: string
  draft: CvData
  busy: boolean
  onChange: (next: CvData) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-card border border-line bg-paper shadow-shell">
      <header className="shrink-0 border-b border-line px-4 py-3 sm:px-6">
        <h3 className="font-serif text-lg text-ink">{title}</h3>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6">
        <CvEditor value={draft} onChange={onChange} disabled={busy} />
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border border-line px-4 py-2 text-sm disabled:opacity-60"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-full bg-forest-deep px-5 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? t('common.saving') : t('cv.save')}
        </button>
      </footer>
    </div>
  )
}
