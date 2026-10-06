'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type EntryState = 'checking' | 'preparing' | 'unavailable' | 'failed' | 'opening'

type BootstrapResponse = {
  website?: { adminUrl?: string | null }
  bootstrap?: {
    status?: string
    step?: string
    label?: string
    workspaceReady?: boolean
  }
}

type HandoffResponse = { token?: string; actionUrl?: string; error?: string }

export function ProjectEntry({ websiteId, name }: { websiteId: string; name: string }) {
  const [state, setState] = useState<EntryState>('checking')
  const [label, setLabel] = useState('Connecting to your website admin')
  const [retrying, setRetrying] = useState(false)
  const handoffStarted = useRef(false)

  const check = useCallback(async (): Promise<boolean> => {
    if (handoffStarted.current) return false
    try {
      const response = await fetch('/api/helloada/websites/' + encodeURIComponent(websiteId) + '/bootstrap', {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({})) as BootstrapResponse
      if (!response.ok) {
        setState('unavailable')
        setLabel('The workspace service is reconnecting. Your request is safe.')
        return false
      }
      if (body.bootstrap?.status === 'failed' || body.bootstrap?.step === 'needs_attention') {
        setState('failed')
        setLabel('Ada could not finish preparing this workspace yet.')
        return false
      }
      if (body.bootstrap?.workspaceReady === true) {
        handoffStarted.current = true
        setState('opening')
        setLabel('Opening ' + name + ' in its Payload admin')
        const grantResponse = await fetch('/api/helloada/websites/' + encodeURIComponent(websiteId) + '/handoff', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        const grant = await grantResponse.json().catch(() => ({})) as HandoffResponse
        if (!grantResponse.ok || !grant.token || !grant.actionUrl) {
          throw new Error('Secure sign-in could not be prepared.')
        }

        const form = document.createElement('form')
        form.method = 'POST'
        form.action = grant.actionUrl
        form.referrerPolicy = 'no-referrer'
        form.hidden = true
        const field = document.createElement('input')
        field.type = 'hidden'
        field.name = 'token'
        field.value = grant.token
        form.append(field)
        document.body.append(form)
        form.submit()
        return false
      }
      setState('preparing')
      setLabel(body.bootstrap?.label || 'Preparing your Payload admin')
      return true
    } catch {
      handoffStarted.current = false
      setState('unavailable')
      setLabel('Secure sign-in is not ready yet. Your workspace is safe; try again shortly.')
      return false
    }
  }, [name, websiteId])

  useEffect(() => {
    let active = true
    let timer: number | undefined
    const poll = async () => {
      if (!active) return
      const shouldContinue = await check()
      if (active && shouldContinue) timer = window.setTimeout(poll, 4000)
    }
    void poll()
    return () => {
      active = false
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [check])

  async function retry() {
    if (retrying) return
    setRetrying(true)
    setState('preparing')
    setLabel('Resuming the same website setup')
    handoffStarted.current = false
    try {
      await fetch('/api/helloada/websites/' + encodeURIComponent(websiteId) + '/bootstrap', { method: 'POST' })
    } finally {
      setRetrying(false)
      await check()
    }
  }

  return (
    <section className="create-card" aria-live="polite">
      <span className="site-phase">{state === 'failed' ? 'Needs attention' : state === 'opening' ? 'Ready' : 'In progress'}</span>
      <h2>{label}</h2>
      <p>This is a short setup step. Your conversation, website content and future work will live in this website’s admin—not in a second workspace here.</p>
      {state === 'failed' || state === 'unavailable' ? (
        <button className="button button-primary" type="button" onClick={() => void retry()} disabled={retrying}>
          {retrying ? 'Resuming…' : 'Try again'} <span aria-hidden="true">→</span>
        </button>
      ) : null}
      <p><a className="text-link" href="/portfolio">Back to your websites</a></p>
    </section>
  )
}
