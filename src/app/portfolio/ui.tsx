'use client'

import { FormEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const pendingKeyStorage = 'helloada.pendingWebsiteCreation'

export function WebsiteScreenshot({ id, name, available }: { id: string; name: string; available: boolean }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  return (
    <div className="site-screenshot">
      {available && !failed && (
        // This authenticated image endpoint serves a real, cached browser capture.
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={(image) => {
          if (image?.complete) {
            if (image.naturalWidth > 0 && !loaded) setLoaded(true)
            else if (image.naturalWidth === 0 && !failed) setFailed(true)
          }
        }} src={'/api/helloada/websites/' + encodeURIComponent(id) + '/screenshot?attempt=' + attempt} alt={'Screenshot of ' + name} loading="lazy" width={1280} height={800} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      )}
      {(!available || failed || !loaded) && <span className="screenshot-status">{!available ? 'Preview not available yet' : failed ? 'Preview unavailable' : 'Preparing screenshot…'}</span>}
      {available && failed && <button type="button" className="screenshot-retry" onClick={(event) => { event.preventDefault(); setFailed(false); setLoaded(false); setAttempt(attempt + 1) }}>Retry preview</button>}
    </div>
  )
}

export function WebsiteVisibility({ id, name, removed }: { id: string; name: string; removed: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/helloada/websites/' + encodeURIComponent(id) + '/portfolio', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ removed: !removed }),
      })
      if (!response.ok) throw new Error('visibility_update_failed')
      router.refresh()
      setConfirming(false)
    } catch {
      setError('The portfolio could not be updated. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="website-visibility">
      {confirming ? (
        <div className="remove-confirmation" role="group" aria-label={'Remove ' + name + ' from portfolio'}>
          <p>Remove <strong>{name}</strong> from your portfolio? You can restore it from Removed websites. Its content is kept, and any hosted website stays online.</p>
          <div className="website-actions">
            <button className="portfolio-action" onClick={() => void save()} disabled={busy}>{busy ? 'Removing…' : 'Confirm removal'}</button>
            <button className="portfolio-action" onClick={() => { setConfirming(false); setError('') }} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="portfolio-action" disabled={busy} aria-label={(removed ? 'Restore ' : 'Remove ') + name + (removed ? ' to portfolio' : ' from portfolio')} onClick={() => removed ? void save() : setConfirming(true)}>
          {busy ? 'Restoring…' : removed ? 'Restore to portfolio' : 'Remove from portfolio'}
        </button>
      )}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  )
}

export function CreateWebsiteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestKey = useRef<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const key = requestKey.current
        || window.sessionStorage.getItem(pendingKeyStorage)
        || window.crypto.randomUUID()
      window.sessionStorage.setItem(pendingKeyStorage, key)
      requestKey.current = key
      const response = await fetch('/api/helloada/websites', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({ name }),
      })
      const result = await response.json().catch(() => ({})) as { id?: string; error?: string }
      if (!response.ok || !result.id) {
        setError(result.error === 'idempotency_conflict'
          ? 'This create request was already used for a different name. Start a new request.'
          : 'The website could not be prepared yet. Your request is safe to retry.')
        if (result.error === 'idempotency_conflict') {
          const nextKey = window.crypto.randomUUID()
          window.sessionStorage.setItem(pendingKeyStorage, nextKey)
          requestKey.current = nextKey
        }
        setBusy(false)
        return
      }
      window.sessionStorage.removeItem(pendingKeyStorage)
      router.push('/websites/' + result.id)
    } catch {
      setError('The connection was interrupted. Retry to continue the same website request.')
      setBusy(false)
    }
  }

  return (
    <section className="create-card">
      <div>
        <h2>Create a website</h2>
        <p>Give it a name. Ada will prepare its admin workspace, where you can start shaping the business and first page.</p>
      </div>
      <form className="create-form" onSubmit={submit}>
        <input aria-label="Website name" placeholder="Name the website" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? 'Preparing…' : 'Create website'} <span aria-hidden="true">→</span>
        </button>
      </form>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  )
}
