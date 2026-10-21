'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { bootstrapProgress, type BootstrapState } from '@/lib/bootstrap-contract'
import './project-entry.css'

type EntryState = 'checking' | 'preparing' | 'unavailable' | 'failed' | 'opening'

type BootstrapResponse = {
  error?: string
  website?: { adminUrl?: string | null }
  bootstrap?: BootstrapState
}

type HandoffResponse = { token?: string; actionUrl?: string; error?: string }

export function ProjectEntry({ websiteId, name }: { websiteId: string; name: string }) {
  const [state, setState] = useState<EntryState>('checking')
  const [label, setLabel] = useState('Connecting to your website admin')
  const [retrying, setRetrying] = useState(false)
  const [bootstrap, setBootstrap] = useState<BootstrapState>({})
  const [diagnostic, setDiagnostic] = useState('')
  const [pollEpoch, setPollEpoch] = useState(0)
  const handoffStarted = useRef(false)
  const progress = bootstrapProgress(bootstrap)

  const check = useCallback(async (): Promise<boolean> => {
    if (handoffStarted.current) return false
    try {
      const response = await fetch('/api/helloada/websites/' + encodeURIComponent(websiteId) + '/bootstrap', {
        cache: 'no-store',
      })
      const body = await response.json().catch(() => ({})) as BootstrapResponse
      if (!response.ok) {
        setState('unavailable')
        setLabel(response.status === 401 ? 'Sign in again to continue setup' : 'Waiting for the workspace service')
        setDiagnostic(body.error || 'Workspace status could not be loaded.')
        return response.status !== 401 && response.status !== 404
      }
      setBootstrap(body.bootstrap || {})
      setDiagnostic(body.bootstrap?.diagnostic || '')
      if (body.bootstrap?.status === 'failed' || body.bootstrap?.step === 'needs_attention') {
        setState('failed')
        setLabel('Ada could not finish preparing this workspace yet.')
        return false
      }
      if (body.bootstrap?.workspaceReady === true) {
        if (handoffStarted.current) return false
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
          setDiagnostic(grant.error || 'Secure sign-in could not be prepared.')
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
      const duringHandoff = handoffStarted.current
      handoffStarted.current = false
      setState('unavailable')
      setLabel(duringHandoff ? 'Secure sign-in could not finish. Try opening the workspace again.' : 'Connection interrupted. Checking again…')
      return !duringHandoff
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
  }, [check, pollEpoch])

  async function retry() {
    if (retrying) return
    setRetrying(true)
    setState('preparing')
    setLabel('Resuming the same website setup')
    handoffStarted.current = false
    try {
      const response = await fetch('/api/helloada/websites/' + encodeURIComponent(websiteId) + '/bootstrap', { method: 'POST' })
      const body = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setDiagnostic(body.error || 'The same workspace could not be resumed.')
      }
    } catch {
      setDiagnostic('Connection interrupted while resuming. The existing website is kept.')
    } finally {
      setRetrying(false)
      setPollEpoch(value => value + 1)
    }
  }

  return (
    <section className="setup-card">
      <div className="setup-status" aria-live="polite">
      <span className="site-phase">{state === 'failed' ? 'Needs attention' : state === 'opening' ? 'Ready' : 'In progress'}</span>
      <h2>{label}</h2>
      <p>{state === 'failed' ? 'Setup stopped at the step below. Your completed steps are kept; retry resumes this same website.' : 'Ada is preparing your private workspace. When the checks pass, you’ll enter automatically—no second sign-in.'}</p>
      </div>
      <div className="setup-progress-head"><span>{progress.active}</span><strong>{progress.percent}%</strong></div>
      <div className="setup-progress" role="progressbar" aria-label="Workspace preparation" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${progress.completed} of ${progress.total} setup milestones complete`}>
        <span style={{ transform: `scaleX(${progress.percent / 100})` }} />
      </div>
      <ol className="setup-steps" aria-label="Provisioning steps">
        {progress.rows.map(row => <li key={row.id} data-status={row.status} aria-current={row.status === 'running' ? 'step' : undefined}>
          <span className="setup-step-icon" aria-hidden="true">{row.status === 'done' ? '✓' : row.status === 'failed' ? '!' : '·'}</span>
          <span>{row.label}</span><small>{row.status === 'done' ? 'Complete' : row.status === 'running' ? 'In progress' : row.status === 'failed' ? 'Stopped' : 'Waiting'}</small>
        </li>)}
      </ol>
      {diagnostic && <details className="setup-diagnostic" open={state === 'failed'}><summary>Setup details</summary><p>{diagnostic}</p>{bootstrap.release?.id && <p>Reference: {bootstrap.release.id} · {bootstrap.release.stage}</p>}</details>}
      {state === 'failed' || state === 'unavailable' ? (
        <button className="button button-primary" type="button" onClick={() => void retry()} disabled={retrying}>
          {retrying ? 'Resuming…' : 'Try again'} <span aria-hidden="true">→</span>
        </button>
      ) : null}
      <p><a className="text-link" href="/portfolio">Back to your websites</a></p>
    </section>
  )
}
