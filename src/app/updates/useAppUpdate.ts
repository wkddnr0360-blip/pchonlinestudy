import { useEffect, useRef, useState } from 'react'
import { activeExam } from '../../storage/exams'
import { base, buildIdOf, current, findLatestRegistration, interval, pruneShellCaches } from './releaseCheck'

const enabled = import.meta.env.PROD && 'serviceWorker' in navigator

export function useAppUpdate() {
  const registration = useRef<ServiceWorkerRegistration>(undefined)
  const applying = useRef(false)
  const reloadTimer = useRef<number>(undefined)
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!enabled) return
    const workers = navigator.serviceWorker
    const watched = new Set<ServiceWorker>()
    let stopped = false
    let checking = false
    let lastChecked = -Infinity
    let controller = workers.controller
    let changed = false

    function signal() {
      if (stopped) return
      const state = registration.current
      const waiting = state?.waiting
      if (!waiting) return
      if (buildIdOf(waiting) === current.id) {
        // A legacy tab may have installed this same build through the fixed migration URL.
        waiting.postMessage({ type: 'SKIP_WAITING' })
      } else {
        setAvailable(true)
      }
    }

    function watch(worker: ServiceWorker | null) {
      if (!worker || watched.has(worker)) return
      watched.add(worker)
      worker.addEventListener('statechange', signal)
    }

    function onUpdate() {
      watch(registration.current?.installing ?? null)
      signal()
    }

    function bind(next: ServiceWorkerRegistration) {
      if (registration.current !== next) {
        registration.current?.removeEventListener('updatefound', onUpdate)
        registration.current = next
      }
      next.addEventListener('updatefound', onUpdate)
      onUpdate()
    }

    async function check() {
      if (stopped || checking || document.visibilityState !== 'visible' || !navigator.onLine) return
      if (performance.now() - lastChecked < 3000) return
      checking = true
      lastChecked = performance.now()
      try {
        const existing = await workers.getRegistration(base.pathname)
        if (stopped) return
        if (existing) bind(existing)
        const next = await findLatestRegistration(existing)
        if (!stopped) bind(next)
      } catch { /* Next online, foreground or periodic check can retry. */ }
      finally { checking = false }
    }

    function onControllerChange() {
      const nextController = workers.controller
      if (!nextController) return
      const build = buildIdOf(nextController)
      if (applying.current) {
        window.clearTimeout(reloadTimer.current)
        window.location.reload()
        return
      }
      // A new install claiming its initial page needs no refresh.
      if (build !== current.id && (build || (controller && controller !== nextController))) {
        changed = true
        setAvailable(true)
      }
      controller = nextController
    }

    const onForeground = () => { void check() }
    const onOnline = () => {
      lastChecked = -Infinity
      void check()
    }
    workers.addEventListener('controllerchange', onControllerChange)
    window.addEventListener('focus', onForeground)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onForeground)
    const timer = window.setInterval(onForeground, interval)
    void check()
    void workers.ready.then((state) => {
      if (!stopped && !changed) return pruneShellCaches(state.scope)
    }).catch(() => undefined)

    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearTimeout(reloadTimer.current)
      workers.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('focus', onForeground)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onForeground)
      registration.current?.removeEventListener('updatefound', onUpdate)
      registration.current = undefined
      for (const worker of watched) worker.removeEventListener('statechange', signal)
    }
  }, [])

  async function applyUpdate() {
    if (!enabled || busy || applying.current || !available) return
    setBusy(true)
    setMessage('')
    try {
      const exam = await activeExam()
      if (exam) {
        throw new Error('진행 중인 모의고사를 마친 뒤 업데이트할 수 있어요.')
      }
      const worker = registration.current?.waiting
      if (!worker) {
        window.location.reload()
        return
      }
      applying.current = true
      reloadTimer.current = window.setTimeout(() => {
        applying.current = false
        setBusy(false)
        setMessage('업데이트가 완료되지 않았어요. 잠시 후 다시 시도해 주세요.')
      }, 10000)
      worker.postMessage({ type: 'SKIP_WAITING' })
    } catch (error) {
      setBusy(false)
      applying.current = false
      window.clearTimeout(reloadTimer.current)
      setMessage(error instanceof Error ? error.message : '업데이트를 적용하지 못했어요.')
    }
  }

  return { available, busy, message, applyUpdate }
}
