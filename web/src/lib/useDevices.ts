import { t } from '../i18n'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ApiError, api, type Device } from '../api'

export function useDevices(
  farmId: number | null,
  active: boolean,
): {
  devices: Device[]
  setDevices: Dispatch<SetStateAction<Device[]>>
  loading: boolean
  error: string
  refresh: () => void
} {
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const hasDataRef = useRef(false)

  const refresh = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    hasDataRef.current = false
    setDevices([])
    setError('')
    setLoading(farmId != null)
  }, [farmId])

  useEffect(() => {
    if (farmId == null) {
      setDevices([])
      setLoading(false)
      setError('')
      return
    }
    if (!active) return

    const id = farmId
    let cancelled = false

    async function load(isPoll: boolean) {
      if (isPoll && document.visibilityState !== 'visible') return
      if (!isPoll && !hasDataRef.current) setLoading(true)
      try {
        const rows = await api.devices(id)
        if (cancelled) return
        setDevices(rows)
        hasDataRef.current = true
        setError('')
      } catch (e) {
        if (cancelled) return
        if (!hasDataRef.current) {
          setError(e instanceof ApiError ? e.message : t('devices.loadError'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load(false)
    const timer = window.setInterval(() => {
      void load(true)
    }, 5_000)
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [farmId, active, tick])

  return { devices, setDevices, loading, error, refresh }
}
