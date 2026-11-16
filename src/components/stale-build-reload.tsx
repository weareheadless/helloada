'use client'

import { useEffect } from 'react'

import { STALE_BUILD_GUARD_KEY, shouldReloadForStaleBuild } from '@/lib/stale-build'

const messageOf = (value: unknown): string => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as { message?: unknown; name?: unknown }
    return `${String(record.name || '')} ${String(record.message || '')}`.trim()
  }
  return ''
}

/**
 * Requests one reload when a navigation fails because the deployed build
 * changed under an open tab. Without this, every deploy leaves owners on a page
 * that can no longer load its own code until they reload by hand.
 */
export function StaleBuildReload() {
  useEffect(() => {
    const reload = (message: string) => {
      const stored = window.sessionStorage.getItem(STALE_BUILD_GUARD_KEY)
      const lastReloadAt = stored === null ? null : Number(stored)
      if (!shouldReloadForStaleBuild(message, lastReloadAt, Date.now())) return
      window.sessionStorage.setItem(STALE_BUILD_GUARD_KEY, String(Date.now()))
      window.location.reload()
    }
    const onError = (event: ErrorEvent) => reload(messageOf(event.error) || String(event.message || ''))
    const onRejection = (event: PromiseRejectionEvent) => reload(messageOf(event.reason))
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
