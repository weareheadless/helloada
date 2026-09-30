'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'

type Recommendation = {
  id: number
  title: string
  summary: string
  action_label: string
}

type BootstrapState = {
  status: string
  step: string
  label: string
  diagnostic: string
}

type IntakeState = {
  conversation_id?: number | null
  revision?: number
  draft_hash?: string
  confirmed_revision?: number | null
  confirmed?: boolean
  readiness?: { state?: string }
}

const phaseLabels: Record<string, string> = {
  intake: 'Getting started',
  designing: 'Taking shape',
  live: 'Live',
  needs_attention: 'Needs attention',
}

const bootstrapLabels: Record<string, string> = {
  requested: 'Opening your workspace',
  creating_repository: 'Preparing the website',
  creating_worker: 'Connecting the live preview',
  creating_data: 'Preparing private website data',
  deploying_shell: 'Publishing the first shell',
  ready: 'Workspace ready',
  needs_attention: 'Workspace needs attention',
}

export function WebsiteRoom({
  website,
  bootstrap,
  initialRecommendations,
}: {
  website: { id: string; name: string; phase?: string; workerUrl?: string | null; tenantId?: string | null }
  bootstrap: BootstrapState
  initialRecommendations: Recommendation[]
}) {
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([])
  const [recommendations, setRecommendations] = useState(initialRecommendations)
  const [bootstrapState, setBootstrapState] = useState(bootstrap)
  const [workerUrl, setWorkerUrl] = useState(website.workerUrl || '')
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [intake, setIntake] = useState<IntakeState | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(
    website.workerUrl ? 'Preview ready' : bootstrap.status === 'failed' ? 'Workspace needs attention' : bootstrap.label,
  )

  const refreshBootstrap = useCallback(async () => {
    const response = await fetch(`/api/helloada/websites/${website.id}/bootstrap`, { cache: 'no-store' })
    if (!response.ok) return
    const body = await response.json() as { website?: { workerUrl?: string | null }; bootstrap?: BootstrapState }
    if (body.bootstrap) {
      setBootstrapState(body.bootstrap)
      if (body.bootstrap.status === 'failed') setStatus('Workspace needs attention')
    }
    const nextWorkerUrl = body.website?.workerUrl || ''
    if (nextWorkerUrl) setWorkerUrl(nextWorkerUrl)
    if (body.bootstrap && (body.bootstrap.status === 'ready' || body.bootstrap.status === 'done')) {
      setStatus(nextWorkerUrl ? 'Preview ready' : 'Workspace ready')
    }
  }, [website.id])

  const refreshIntake = useCallback(async (forConversationId = conversationId) => {
    const query = forConversationId ? `?conversation_id=${encodeURIComponent(forConversationId)}` : ''
    const response = await fetch(`/api/helloada/websites/${website.id}/chat/status${query}`, { cache: 'no-store' })
    if (!response.ok) return
    const body = await response.json() as { conversation_id?: number | null; intake?: IntakeState }
    const nextConversationId = body.conversation_id || body.intake?.conversation_id
    if (nextConversationId) setConversationId(Number(nextConversationId))
    if (body.intake) setIntake(body.intake)
  }, [conversationId, website.id])

  const refreshRecommendations = useCallback(async () => {
    const response = await fetch(`/api/helloada/websites/${website.id}/design/recommendations`, { cache: 'no-store' })
    if (!response.ok) return
    const body = await response.json() as { recommendations?: Recommendation[] }
    setRecommendations(body.recommendations || [])
  }, [website.id])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void refreshIntake()
      void refreshBootstrap()
    }, 0)
    if (workerUrl || bootstrapState.status === 'ready' || bootstrapState.status === 'done') return () => window.clearTimeout(initialLoad)
    const timer = window.setInterval(() => void refreshBootstrap(), 5000)
    return () => {
      window.clearTimeout(initialLoad)
      window.clearInterval(timer)
    }
  }, [bootstrapState.status, refreshBootstrap, refreshIntake, workerUrl])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!message.trim() || busy) return
    const next = message.trim()
    setMessages((items) => [...items, { role: 'you', text: next }])
    setMessage('')
    setBusy(true)
    const response = await fetch(`/api/helloada/websites/${website.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: next, conversation_id: conversationId }),
    })
    const body = await response.json().catch(() => ({})) as { conversation_id?: number }
    if (response.ok) {
      const nextConversationId = body.conversation_id ? Number(body.conversation_id) : conversationId
      if (nextConversationId) setConversationId(nextConversationId)
      setStatus('Ada is listening')
      setMessages((items) => [...items, { role: 'ada', text: 'I have the note. I will keep the brief close and show you the next meaningful decision.' }])
      window.setTimeout(() => void refreshIntake(nextConversationId), 300)
    } else {
      setStatus('Workspace connection is still in progress')
      setMessages((items) => [...items, { role: 'ada', text: 'The workspace is still connecting. Nothing has been changed yet; try again when the preview is ready.' }])
    }
    setBusy(false)
  }

  async function confirmBrief() {
    if (busy || !conversationId || !intake?.revision || !intake.draft_hash) return
    setBusy(true)
    const response = await fetch(`/api/helloada/websites/${website.id}/intake/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversation_id: conversationId,
        revision: intake.revision,
        draft_hash: intake.draft_hash,
        confirmation_text: 'Confirm this working brief',
        idempotency_key: `helloada:${website.id}:confirm:${intake.revision}:${intake.draft_hash}`,
      }),
    })
    if (response.ok) {
      const body = await response.json().catch(() => ({})) as {
        intake?: IntakeState
        session?: { confirmed_revision?: number }
      }
      setIntake((value) => value ? {
        ...value,
        ...(body.intake || {}),
        confirmed: body.intake?.confirmed ?? true,
        confirmed_revision: body.intake?.confirmed_revision
          ?? body.session?.confirmed_revision
          ?? value.revision,
      } : body.intake || value)
      setStatus('Brief confirmed. Choose a direction when ready.')
    } else {
      setStatus('The brief needs one more pass before it can be confirmed')
    }
    setBusy(false)
  }

  async function proposeDirection() {
    const confirmedRevision = intake?.confirmed_revision
    if (busy || !conversationId || !confirmedRevision) return
    setBusy(true)
    const response = await fetch(`/api/helloada/websites/${website.id}/design/direction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, confirmed_revision: confirmedRevision }),
    })
    const body = await response.json().catch(() => ({})) as { recommendation?: Recommendation }
    if (response.ok && body.recommendation) {
      setRecommendations((items) => items.some((item) => item.id === body.recommendation?.id) ? items : [...items, body.recommendation as Recommendation])
      setStatus('Direction ready for your approval')
      setMessages((items) => [...items, { role: 'ada', text: 'I prepared a direction from the confirmed brief. I am waiting for your call before building anything.' }])
    } else {
      setStatus('The direction could not be prepared yet')
    }
    setBusy(false)
  }

  async function accept(recommendation: Recommendation) {
    setBusy(true)
    const response = await fetch(`/api/helloada/websites/${website.id}/design/recommendations/${recommendation.id}/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId }),
    })
    const body = await response.json().catch(() => ({})) as { operation?: { status?: string } }
    if (response.ok) {
      setRecommendations((items) => items.filter((item) => item.id !== recommendation.id))
      if (body.operation?.status === 'failed') {
        setStatus('That step needs attention')
        setMessages((items) => [...items, { role: 'ada', text: 'I could not complete that step. Nothing else was started.' }])
      } else {
        setMessages((items) => [...items, { role: 'ada', text: `${recommendation.title}. I have started that step and will wait before choosing what comes next.` }])
        setStatus('Ada is working')
      }
      void refreshRecommendations()
      void refreshBootstrap()
    }
    setBusy(false)
  }

  async function retryBootstrap() {
    if (busy) return
    setBusy(true)
    const response = await fetch(`/api/helloada/websites/${website.id}/bootstrap`, { method: 'POST' })
    if (response.ok) {
      setStatus('Workspace connected')
      await refreshBootstrap()
    } else {
      setStatus('Workspace connection still needs attention')
      await refreshBootstrap()
    }
    setBusy(false)
  }

  const phaseLabel = phaseLabels[website.phase || 'intake'] || 'Getting started'
  const bootstrapLabel = bootstrapLabels[bootstrapState.step] || bootstrapState.label
  const readyToConfirm = intake?.readiness?.state === 'ready_to_build' && !intake.confirmed
  const canProposeDirection = Boolean(intake?.confirmed && intake.confirmed_revision && conversationId && recommendations.length === 0)

  return <div className="site-room">
    <div>
      <div className="preview-frame">
        {workerUrl ? <iframe title={`${website.name} preview`} src={workerUrl} /> : <div className="preview-empty"><strong>{bootstrapLabel}.</strong><br />This will become the real website, not a second staging copy.</div>}
      </div>
      <div className="room-panel" style={{ marginTop: 15 }}>
        <div className="status-line">{status}</div>
        <div style={{ display: 'grid', gap: 10 }}>{messages.map((item, index) => <p key={`${item.role}-${index}`}><strong>{item.role === 'you' ? 'You' : 'Ada'}:</strong> {item.text}</p>)}</div>
        <form onSubmit={send}>
          <div className="field"><label htmlFor="brief-message">Tell Ada what matters</label><textarea id="brief-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="What does the business do, and what should the site help someone feel or do?" rows={4} style={{ width: '100%', border: '1px solid var(--line)', padding: 14, background: 'rgba(255,255,255,.28)', color: 'var(--ink)', font: '14px var(--body)', resize: 'vertical' }} /></div>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send to Ada'} <span>→</span></button>
        </form>
        {bootstrapState.status === 'failed' && <button className="button" type="button" onClick={retryBootstrap} disabled={busy}>Try connecting again <span>→</span></button>}
        {readyToConfirm && <button className="button" type="button" onClick={confirmBrief} disabled={busy}>Confirm this brief <span>→</span></button>}
        {canProposeDirection && <button className="button" type="button" onClick={proposeDirection} disabled={busy}>Prepare a design direction <span>→</span></button>}
      </div>
    </div>
    <aside className="room-panel">
      <span className="site-phase">{phaseLabel}</span>
      <h2>First, the brief.</h2>
      <p>Ada listens before she builds. When there is a structural or visual choice, she will put it here instead of deciding alone.</p>
      {recommendations.map((recommendation) => <div className="recommendation" key={recommendation.id}><strong>{recommendation.title}</strong><p>{recommendation.summary}</p><button type="button" disabled={busy} onClick={() => accept(recommendation)}>{recommendation.action_label || 'Approve this step'} →</button></div>)}
    </aside>
  </div>
}
