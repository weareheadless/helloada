'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

import { BrandLink } from '@/components/brand-link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/users/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!response.ok) throw new Error('request_failed')
      setSubmitted(true)
    } catch {
      setError('We could not send the request right now. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <nav className="topbar"><BrandLink /><Link className="text-link" href="/">Back home</Link></nav>
      <section className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" /> account recovery</div>
        <h1>Let’s get<br /><em>you back in.</em></h1>
        {submitted ? (
          <>
            <p>If an account uses that email, a secure reset link is on its way. It expires in 30 minutes.</p>
            <p className="microcopy" style={{ marginTop: 24 }}><Link href="/login">Return to sign in</Link></p>
          </>
        ) : (
          <>
            <p>Enter the email on your HelloAda account. We’ll send a one-time link to choose a new password.</p>
            <form onSubmit={submit}>
              <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <span>→</span></button>
            </form>
            <p className="microcopy" style={{ marginTop: 24 }}><Link href="/login">Return to sign in</Link></p>
          </>
        )}
      </section>
    </main>
  )
}
