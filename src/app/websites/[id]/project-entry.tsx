'use client'

import { useCallback, useEffect, useState } from 'react'

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

export function ProjectEntry({ websiteId, name }: { websiteId: string; name: string }) {
  const [state, setState] = useState<EntryState>('checking')
  const [label, setLabel] = useState('Connecting to your website admin')
  const [adminUrl, setAdminUrl] = useState('')
  const [retrying, setRetrying] = useState(false)

  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/helloada/websites/' + encodeURIComponent(websiteId) + '/bootstrap', {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({})) as BootstrapResponse
      if (!response.ok) {
        setState('unavailable')
        setLabel('The workspace service is reconnecting. Your request is safe.')
        return
      }
      if (body.bootstrap?.status === 'failed' || body.bootstrap?.step === 'needs_attention') {
        setState('failed')
        setLabel('Ada could not finish preparing this workspace yet.')
        return
      }
      if (body.bootstrap?.workspaceReady === true) {
        if (!body.website?.adminUrl) {
          setState('failed')
          setLabel('The workspace is ready, but its verified admin address is missing.')
          return
        }
        setAdminUrl(body.website.adminUrl)
        setState('opening')
        setLabel('Opening ' + name + ' in its Payload admin')
        window.location.assign(body.website.adminUrl)
        return
      }
      setState('preparing')
      setLabel(body.bootstrap?.label || 'Preparing your Payload admin')
    } catch {
      setState('unavailable')
      setLabel('The workspace service is reconnecting. Your request is safe.')
    }
  }, [name, websiteId])

  useEffect(() => {
    let active = true
    let timer: number | undefined
    const poll = async () => {
      if (!active) return
      await check()
      if (active) timer = window.setTimeout(poll, 4000)
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
      {state === 'failed' ? (
        <button className="button button-primary" type="button" onClick={() => void retry()} disabled={retrying}>
          {retrying ? 'Resuming…' : 'Retry setup'} <span aria-hidden="true">→</span>
        </button>
      ) : null}
      {state === 'opening' && adminUrl ? <a className="button button-primary" href={adminUrl}>Continue to admin <span aria-hidden="true">→</span></a> : null}
      <p><a className="text-link" href="/portfolio">Back to your websites</a></p>
    </section>
  )
}
