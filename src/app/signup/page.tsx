'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useState } from 'react'

import { BrandLink } from '@/components/brand-link'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    })
    if (!response.ok) {
      setError('That account could not be created. Try another email or a longer password.')
      setBusy(false)
      return
    }
    const login = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!login.ok) {
      router.push('/login')
      return
    }
    router.push('/portfolio')
  }

  return (
    <main className="auth-shell">
      <nav className="topbar"><BrandLink /><Link className="text-link" href="/login">Sign in</Link></nav>
      <section className="auth-card">
        <div className="eyebrow"><span className="eyebrow-dot" /> begin here</div>
        <h1>Make room<br /><em>for the work.</em></h1>
        <p>One account for the websites you are shaping now—and the ones that come next.</p>
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="name">Name</label><input id="name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Opening…' : 'Create account'} <span>→</span></button>
        </form>
      </section>
    </main>
  )
}
