import { useCallback, useEffect, useRef, useState } from 'react'
import { graphemes } from './safeReveal'

const BASE_CPS = 55
const MAX_SECONDS = 7
const SHORT_LEN = 40
const SENTENCE_PAUSE = 120
const COMMA_PAUSE = 60
const PAUSE_CAP = 250
const MAX_FRAME_DT = 50

function pauseMs(g: string): number {
  if (g === '.' || g === '!' || g === '?' || g === '؟') return SENTENCE_PAUSE
  if (g === ',' || g === ';' || g === ':' || g === '\n') return COMMA_PAUSE
  return 0
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

type Run = {
  id: string
  text: string
  shown: string
  done: boolean
}

export function useTypewriter() {
  const reduced = usePrefersReducedMotion()
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced
  const [run, setRun] = useState<Run | null>(null)
  const skipRef = useRef<() => void>(() => {})

  const start = useCallback((id: string, text: string) => {
    const body = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const instant =
      reducedRef.current ||
      (typeof document !== 'undefined' && document.hidden) ||
      body.length === 0
    if (instant) {
      setRun({ id, text: body, shown: body, done: true })
      skipRef.current = () => {}
      return
    }
    setRun({ id, text: body, shown: '', done: false })
    skipRef.current = () => {
      setRun((s) => (s && s.id === id && !s.done ? { ...s, shown: body, done: true } : s))
    }
  }, [])

  const reset = useCallback(() => {
    skipRef.current = () => {}
    setRun(null)
  }, [])

  const skip = useCallback(() => {
    skipRef.current()
  }, [])

  useEffect(() => {
    function onVis() {
      if (document.hidden) skipRef.current()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const id = run?.id
  const text = run?.text
  const done = run?.done ?? true

  useEffect(() => {
    if (!id || text === undefined || done) return
    if (reduced) {
      setRun((s) => (s && s.id === id && !s.done ? { ...s, shown: text, done: true } : s))
      return
    }

    const full: string = text
    const units = graphemes(full)
    const short = units.length < SHORT_LEN
    const baseCps = short ? BASE_CPS : Math.max(BASE_CPS, units.length / MAX_SECONDS)
    const started = performance.now()
    const deadline = short ? Number.POSITIVE_INFINITY : started + MAX_SECONDS * 1000

    let index = 0
    let cancelled = false
    let raf = 0
    let last = started
    let carry = 1000 / baseCps
    let pauseLeft = 0
    let pauseBudget = PAUSE_CAP

    function finish() {
      if (cancelled) return
      cancelled = true
      cancelAnimationFrame(raf)
      setRun((s) => (s && s.id === id && !s.done ? { ...s, shown: full, done: true } : s))
    }

    skipRef.current = finish

    function tick(now: number) {
      if (cancelled) return
      if (document.hidden) {
        finish()
        return
      }
      const dt = Math.min(now - last, MAX_FRAME_DT)
      last = now

      if (!short && now >= deadline) {
        finish()
        return
      }

      if (pauseLeft > 0) {
        pauseLeft = Math.max(0, pauseLeft - dt)
        raf = requestAnimationFrame(tick)
        return
      }

      if (index >= units.length) {
        finish()
        return
      }

      const remaining = units.length - index
      const timeLeft = deadline - now
      const cps =
        !short && timeLeft > 0
          ? Math.max(baseCps, remaining / (timeLeft / 1000))
          : baseCps
      const interval = 1000 / cps
      const maxBurst = Math.max(3, Math.ceil(cps / 60) + 1)

      carry += dt
      let burst = 0
      while (carry >= interval && burst < maxBurst && index < units.length) {
        carry -= interval
        const g = units[index]
        if (g === undefined) break
        index += 1
        burst += 1
        const wait = pauseMs(g)
        if (wait > 0 && index < units.length) {
          const extra = Math.min(wait, pauseBudget)
          pauseBudget -= extra
          if (extra > 0 && now + extra < deadline) pauseLeft += extra
          carry = 0
          break
        }
        pauseBudget = PAUSE_CAP
      }
      if (burst > 0) {
        const next = units.slice(0, index).join('')
        setRun((s) => (s && s.id === id && !s.done ? { ...s, shown: next } : s))
      }
      if (index >= units.length) finish()
      else raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [id, text, done, reduced])

  return {
    id: run?.id ?? null,
    shown: run ? (run.done ? run.text : run.shown) : '',
    done,
    start,
    skip,
    reset,
  }
}
