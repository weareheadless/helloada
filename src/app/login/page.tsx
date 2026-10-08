'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'

import { BrandLink } from '@/components/brand-link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) {
        setError('That sign-in did not work. Check the email and password and try again.')
        setBusy(false)
        return
      }
      const requestedPath = new URLSearchParams(window.location.search).get('next')
      const safePath = requestedPath && requestedPath.startsWith('/') && !requestedPath.startsWith('//')
        ? new URL(requestedPath, window.location.origin)
        : null
      const destination = safePath?.origin === window.location.origin
        ? `${safePath.pathname}${safePath.search}${safePath.hash}`
        : '/portfolio'
      window.location.assign(destination)
    } catch {
      setError('HelloAda could not finish signing in. Check your connection and try again.')
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <nav className="topbar"><BrandLink /><Link className="text-link" href="/">Back home</Link></nav>
      <section className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" /> welcome back</div>
        <h1>Pick up<br /><em>where you left off.</em></h1>
        <p>Your websites and Ada’s next recommendations are waiting in one place.</p>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="field">
            <div className="auth-field-heading">
              <label htmlFor="password">Password</label>
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Opening…' : 'Open HelloAda'} <span>→</span></button>
        </form>
        <p className="microcopy" style={{ marginTop: 24 }}>New here? <Link href="/signup">Create an account</Link></p>
      </section>
    </main>
  )
}
