import { useEffect } from 'react'

export function useDashboardPoll(
  load: (signal: AbortSignal) => Promise<void>,
  interval: number,
  revision: number,
) {
  useEffect(() => {
    let timer: number | undefined
    let request: AbortController | undefined

    async function run() {
      if (document.visibilityState !== 'visible' || request) return
      const controller = new AbortController()
      request = controller
      const start = Date.now()
      try {
        await load(controller.signal)
      } finally {
        if (!controller.signal.aborted) {
          request = undefined
          timer = window.setTimeout(() => void run(), Math.max(0, interval - (Date.now() - start)))
        }
      }
    }

    function stop() {
      window.clearTimeout(timer)
      request?.abort()
      request = undefined
    }

    function onVisibility() {
      stop()
      void run()
    }

    void run()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load, interval, revision])
}
