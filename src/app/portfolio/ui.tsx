'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'

export function CreateWebsiteForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const response = await fetch('/api/helloada/websites', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      setError('The website could not be created yet.')
      setBusy(false)
      return
    }
    const result = await response.json() as { id: string }
    router.push(`/websites/${result.id}`)
  }

  return <section className="create-card"><h2>Open a new website</h2><form className="create-form" onSubmit={submit}><input aria-label="Website name" placeholder="Name the website" value={name} onChange={(event) => setName(event.target.value)} required /><button className="button" type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open workspace'} <span>→</span></button></form>{error && <p className="auth-error" role="alert">{error}</p>}</section>
}
