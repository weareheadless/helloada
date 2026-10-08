'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

import { BrandLink } from '@/components/brand-link'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [complete, setComplete] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token')
    if (!token) {
      setError('This reset link is incomplete. Request a new one to continue.')
      return
    }
    if (password !== confirmation) {
      setError('Those passwords do not match.')
      return
    }

    setBusy(true)
    window.history.replaceState(null, '', window.location.pathname)
    try {
      const response = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!response.ok) throw new Error('reset_failed')
      setComplete(true)
      setPassword('')
      setConfirmation('')
    } catch {
      setError('This link may have expired or already been used. Request a new reset link and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <nav className="topbar"><BrandLink /><Link className="text-link" href="/">Back home</Link></nav>
      <section className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" /> secure password reset</div>
        <h1>{complete ? <>You’re back<br /><em>in control.</em></> : <>Choose a<br /><em>new password.</em></>}</h1>
        {complete ? (
          <>
            <p>Your password has been updated. Sign in with your new password to continue.</p>
            <p className="microcopy" style={{ marginTop: 24 }}><Link href="/login">Return to sign in</Link></p>
          </>
        ) : (
          <>
            <p>Choose a password with at least 12 characters. This link can only be used once.</p>
            <form onSubmit={submit}>
              <div className="field"><label htmlFor="password">New password</label><input id="password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
              <div className="field"><label htmlFor="confirmation">Confirm new password</label><input id="confirmation" type="password" autoComplete="new-password" minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Updating…' : 'Set new password'} <span>→</span></button>
            </form>
            <p className="microcopy" style={{ marginTop: 24 }}><Link href="/forgot-password">Request another reset link</Link></p>
          </>
        )}
      </section>
    </main>
  )
}
