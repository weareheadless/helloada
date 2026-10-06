'use client'

import { FormEvent, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const pendingKeyStorage = 'helloada.pendingWebsiteCreation'

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
