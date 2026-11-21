import { t } from '../i18n'
import { useCallback, useEffect, useRef, useState } from 'react'

export const SPEECH_LANGS = [
  { code: 'ar-TN', get label() { return t('voice.tunisianArabic') } },
  { code: 'fr-FR', get label() { return t('voice.french') } },
  { code: 'en-US', get label() { return t('voice.english') } },
  { code: 'ja-JP', get label() { return t('voice.japanese') } },
] as const

export type SpeechLang = (typeof SPEECH_LANGS)[number]['code']

const LANG_KEY = 'aqua_speech_lang'
const FAIL_WINDOW_MS = 2500
const FAIL_LIMIT = 3
const RESTART_MS = 80

export function isSpeechLang(v: string): v is SpeechLang {
  return v === 'ar-TN' || v === 'fr-FR' || v === 'en-US' || v === 'ja-JP'
}

export function speechLangLabel(lang: SpeechLang): string {
  for (const row of SPEECH_LANGS) {
    if (row.code === lang) return row.label
  }
  return lang
}

export function readSpeechLang(): SpeechLang {
  try {
    const stored = localStorage.getItem(LANG_KEY)
    if (stored && isSpeechLang(stored)) return stored
  } catch {
    /* private mode / quota */
  }
  // html[lang] is the English UI, not a user speech choice.
  const guesses: string[] = []
  try {
    if (navigator.language) guesses.push(navigator.language)
    if (navigator.languages) guesses.push(...navigator.languages)
  } catch {
    /* ignore */
  }
  for (const raw of guesses) {
    const x = raw.toLowerCase()
    if (x.startsWith('ar')) return 'ar-TN'
    if (x.startsWith('fr')) return 'fr-FR'
    if (x.startsWith('en')) return 'en-US'
    if (x.startsWith('ja')) return 'ja-JP'
  }
  return 'ar-TN'
}

export function writeSpeechLang(lang: SpeechLang): void {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* private mode / quota */
  }
}

function glue(left: string, right: string): string {
  if (!right) return left
  if (!left) return right
  if (/\s$/.test(left) || /^\s/.test(right)) return left + right
  return `${left} ${right}`
}

/** Minimal engine shape: lib.dom has result events but not webkitSpeechRecognition. */
interface SpeechEngine {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechEngineCtor = new () => SpeechEngine

function speechEngineCtor(): SpeechEngineCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechEngineCtor
    webkitSpeechRecognition?: SpeechEngineCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function mapSpeechError(code: string): string | null {
  if (code === 'aborted' || code === 'no-speech') return null
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return t('voice.blocked')
  }
  if (code === 'audio-capture') return t('voice.noMic')
  if (code === 'network') return t('voice.network')
  return t('voice.stopped')
}

function isFatalSpeechError(code: string): boolean {
  return (
    code === 'not-allowed' ||
    code === 'service-not-allowed' ||
    code === 'audio-capture'
  )
}

type UseSpeechOpts = {
  lang: SpeechLang
  onText: (text: string) => void
}

export function useSpeech({ lang, onText }: UseSpeechOpts): {
  supported: boolean
  listening: boolean
  interim: string
  error: string
  start: (base?: string) => void
  stop: () => void
  toggle: (base?: string) => void
} {
  const [supported] = useState(() => speechEngineCtor() != null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')

  const onTextRef = useRef(onText)
  onTextRef.current = onText
  const langRef = useRef(lang)
  const wantedRef = useRef(false)
  const genRef = useRef(0)
  const recRef = useRef<SpeechEngine | null>(null)
  const restartTimerRef = useRef(0)
  const baseRef = useRef('')
  const confirmedRef = useRef('')
  const committedRef = useRef('')
  const interimRef = useRef('')
  const failAtRef = useRef<number[]>([])

  const displayed = () =>
    glue(baseRef.current, glue(confirmedRef.current, interimRef.current))

  const halt = useCallback((keepText: boolean, message: string) => {
    wantedRef.current = false
    genRef.current += 1
    if (restartTimerRef.current !== 0) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = 0
    }
    if (keepText) onTextRef.current(displayed())
    setListening(false)
    setInterim('')
    interimRef.current = ''
    setError(message)
    const rec = recRef.current
    recRef.current = null
    if (rec) {
      rec.onresult = null
      rec.onerror = null
      rec.onend = null
      rec.abort()
    }
  }, [])

  const begin = useCallback(() => {
    const Ctor = speechEngineCtor()
    if (!Ctor || !wantedRef.current) return
    const old = recRef.current
    recRef.current = null
    if (old) {
      old.onresult = null
      old.onerror = null
      old.onend = null
      old.abort()
    }
    const rec = new Ctor()
    const myGen = genRef.current
    rec.continuous = true
    rec.interimResults = true
    rec.lang = langRef.current

    rec.onresult = (ev) => {
      if (genRef.current !== myGen || !wantedRef.current) return
      let sessionFinal = ''
      let inter = ''
      for (let i = 0; i < ev.results.length; i++) {
        const res = ev.results.item(i)
        const piece = res.length > 0 ? res.item(0).transcript : ''
        if (res.isFinal) sessionFinal += piece
        else inter += piece
      }
      confirmedRef.current = glue(committedRef.current, sessionFinal)
      interimRef.current = inter
      setInterim(inter)
      setError('')
      onTextRef.current(displayed())
    }

    rec.onerror = (ev) => {
      if (genRef.current !== myGen) return
      const code = ev.error
      if (code === 'aborted' || code === 'no-speech') return
      const msg = mapSpeechError(code) ?? t('voice.stopped')
      const now = Date.now()
      failAtRef.current = failAtRef.current.filter((t) => now - t < FAIL_WINDOW_MS)
      failAtRef.current.push(now)
      if (isFatalSpeechError(code) || failAtRef.current.length >= FAIL_LIMIT) {
        halt(true, msg)
      }
    }

    rec.onend = () => {
      if (genRef.current !== myGen) return
      if (!wantedRef.current) return
      // Chrome ends the session on silence; keep the last interim and restart.
      if (interimRef.current) {
        confirmedRef.current = glue(confirmedRef.current, interimRef.current)
        interimRef.current = ''
        setInterim('')
        onTextRef.current(displayed())
      }
      committedRef.current = confirmedRef.current
      if (restartTimerRef.current !== 0) {
        window.clearTimeout(restartTimerRef.current)
        restartTimerRef.current = 0
      }
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = 0
        if (genRef.current !== myGen || !wantedRef.current) return
        rec.lang = langRef.current
        try {
          rec.start()
        } catch {
          halt(true, t('voice.stopped'))
        }
      }, RESTART_MS)
    }

    recRef.current = rec
    try {
      rec.start()
    } catch {
      halt(true, t('voice.stopped'))
    }
  }, [halt])

  const stop = useCallback(() => {
    if (!wantedRef.current && recRef.current == null && restartTimerRef.current === 0) {
      return
    }
    halt(wantedRef.current, '')
  }, [halt])

  const start = useCallback(
    (base = '') => {
      if (!speechEngineCtor()) return
      if (wantedRef.current) return
      baseRef.current = base
      confirmedRef.current = ''
      committedRef.current = ''
      interimRef.current = ''
      failAtRef.current = []
      setInterim('')
      setError('')
      wantedRef.current = true
      genRef.current += 1
      setListening(true)
      begin()
    },
    [begin],
  )

  const toggle = useCallback(
    (base = '') => {
      if (wantedRef.current) stop()
      else start(base)
    },
    [start, stop],
  )

  useEffect(() => {
    const prev = langRef.current
    langRef.current = lang
    if (prev === lang || !wantedRef.current) return
    const kept = displayed()
    baseRef.current = kept
    confirmedRef.current = ''
    committedRef.current = ''
    interimRef.current = ''
    setInterim('')
    onTextRef.current(kept)
    recRef.current?.abort()
  }, [lang])

  useEffect(() => {
    function onVis() {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [stop])

  useEffect(() => {
    return () => {
      wantedRef.current = false
      genRef.current += 1
      if (restartTimerRef.current !== 0) {
        window.clearTimeout(restartTimerRef.current)
        restartTimerRef.current = 0
      }
      const rec = recRef.current
      recRef.current = null
      if (rec) {
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.abort()
      }
    }
  }, [])

  return { supported, listening, interim, error, start, stop, toggle }
}
