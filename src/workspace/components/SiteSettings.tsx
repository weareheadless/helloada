'use client'

import { useCallback, useState } from 'react'

export type SiteSettingsSnapshot = {
  identity: {
    tenantId: string
    displayName: string
    workerName: string
    workerUrl: string
    publicUrl: string
    adminUrl: string
    payloadUrl: string
    registeredDomain: string
    canonicalHost: string
  }
  domain: {
    registeredDomain: string
    publicUrl: string
    canonicalHost: string
    zone: { id: string; name: string; status: string } | null
    customDomains: Array<{ hostname: string; service: string; certId: string | null }>
    serving: { ok: boolean; status: number | null; finalUrl?: string; reason?: string }
    available: boolean
    reason: string
  }
  email: {
    mode: 'managed' | 'external'
    provider: string
    mailbox: { address: string; domain: string; localPart: string; domainSource: string }
    provisioning: {
      auto: boolean
      state?: string
      address?: string
      error?: string
      lastAttemptAt?: string
    }
    alerts: {
      enabled: boolean
      recipient: string
      subject: string
      body: string
      inbound: boolean
      external: boolean
    }
  }
  seo: {
    state: string
    siteUrl: string
    gscProperty: string
    gscVerified: boolean
    projectId: string
    siteId: string
  }
  capabilities: { attachDomain: boolean; buyDomain: boolean }
}

type Conflict = {
  kind: string
  hostname: string
  detail: string
  service: string
  records: Array<{ type: string; name: string; content: string; proxied: boolean }>
}

const api = (slug: string, suffix = '') =>
  `/api/helloada/websites/${encodeURIComponent(slug)}/settings${suffix}`

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => ({})) as {
    error?: string
    detail?: string | { error?: string; conflict?: Conflict | null }
  }
  const detail = body.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') return detail.error || 'The change was refused.'
  return body.error || `The change was refused (${response.status}).`
}

async function readConflict(response: Response): Promise<Conflict | null> {
  const body = await response.json().catch(() => ({})) as {
    detail?: { conflict?: Conflict | null }
  }
  return body.detail?.conflict || null
}

export function SiteSettings({
  slug,
  websiteName,
  initial,
  initialError = '',
}: {
  slug: string
  websiteName: string
  initial: SiteSettingsSnapshot | null
  initialError?: string
}) {
  const [snapshot, setSnapshot] = useState<SiteSettingsSnapshot | null>(initial)
  const [name, setName] = useState(websiteName)
  const [domain, setDomain] = useState(
    initial && !/\.workers\.dev$/i.test(initial.identity.registeredDomain)
      ? initial.identity.registeredDomain
      : '',
  )
  const [canonical, setCanonical] = useState<'www' | 'apex'>(
    initial?.identity.canonicalHost?.startsWith('www.') ? 'www' : 'apex',
  )
  const [mode, setMode] = useState<'managed' | 'external'>(initial?.email.mode || 'managed')
  const [provider, setProvider] = useState(initial?.email.provider || '')
  const [localPart, setLocalPart] = useState(initial?.email.mailbox.localPart || '')
  const [mailDomain, setMailDomain] = useState(initial?.email.mailbox.domain || '')
  const [recipient, setRecipient] = useState(initial?.email.alerts.recipient || '')
  const [inbound, setInbound] = useState(initial?.email.alerts.inbound ?? true)
  const [external, setExternal] = useState(initial?.email.alerts.external ?? true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState(initialError)
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState<Conflict | null>(null)

  const refresh = useCallback(async () => {
    const response = await fetch(api(slug), { cache: 'no-store' })
    if (!response.ok) {
      setError(await readError(response))
      return
    }
    const next = await response.json() as SiteSettingsSnapshot
    setSnapshot(next)
    setError('')
    setName(next.identity.displayName || name)
    setDomain(
      next.identity.registeredDomain && !/\.workers\.dev$/i.test(next.identity.registeredDomain)
        ? next.identity.registeredDomain
        : '',
    )
    setCanonical(next.identity.canonicalHost.startsWith('www.') ? 'www' : 'apex')
    setMode(next.email.mode)
    setProvider(next.email.provider)
    setLocalPart(next.email.mailbox.localPart)
    setMailDomain(next.email.mailbox.domain)
    setRecipient(next.email.alerts.recipient)
    setInbound(next.email.alerts.inbound)
    setExternal(next.email.alerts.external)
  }, [slug, name])

  async function saveName(event: React.FormEvent) {
    event.preventDefault()
    setBusy('name')
    setError('')
    setNotice('')
    try {
      const response = await fetch(api(slug), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) {
        setError(await readError(response))
        return
      }
      setNotice('Website name saved.')
      await refresh()
    } finally {
      setBusy('')
    }
  }

  async function saveEmail(event: React.FormEvent) {
    event.preventDefault()
    setBusy('email')
    setError('')
    setNotice('')
    try {
      // Only send the mailbox identity the owner actually changed, so saving
      // the alerts never rewrites a domain that was registered elsewhere.
      const mailbox: { localPart?: string; domain?: string } = {}
      if (localPart.trim().toLowerCase() !== (snapshot?.email.mailbox.localPart || '').toLowerCase()) {
        mailbox.localPart = localPart.trim()
      }
      if (mailDomain.trim().toLowerCase() !== (snapshot?.email.mailbox.domain || '').toLowerCase()) {
        mailbox.domain = mailDomain.trim()
      }
      const response = await fetch(api(slug, '/email'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          mode,
          provider: mode === 'external' ? provider : '',
          ...(Object.keys(mailbox).length ? { mailbox } : {}),
          alerts: {
            enabled: true,
            recipient,
            inbound,
            external,
          },
        }),
      })
      if (!response.ok) {
        setError(await readError(response))
        return
      }
      setNotice('Mail settings saved.')
      await refresh()
    } finally {
      setBusy('')
    }
  }

  async function attachDomain(event: React.FormEvent | null, options?: { replaceDns?: boolean; takeover?: boolean }) {
    event?.preventDefault()
    if (!domain.trim()) {
      setError('Enter the domain you want to use.')
      return
    }
    setBusy('domain')
    setError('')
    setNotice('')
    setConflict(null)
    try {
      const response = await fetch(api(slug, '/domain'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          domain: domain.trim(),
          canonical,
          replaceDns: options?.replaceDns === true,
          takeover: options?.takeover === true,
        }),
      })
      if (!response.ok) {
        setConflict(await readConflict(response))
        setError(await readError(response))
        return
      }
      const result = await response.json() as {
        state: string
        rebuild?: { state: string; reason?: string }
      }
      setNotice(
        result.state === 'attached'
          ? 'Domain attached and serving.'
          : 'Domain attached. The certificate and DNS may take a minute to become active.',
      )
      if (result.rebuild?.state === 'failed') {
        setNotice('Domain attached. The rebuild could not be requested yet; the next release will pick up the new address.')
      }
      await refresh()
    } finally {
      setBusy('')
    }
  }

  if (!snapshot) {
    return (
      <div className="hs-shell">
        <header className="hs-head">
          <p className="hs-eyebrow">Settings</p>
          <h1 className="hs-title">{websiteName}</h1>
        </header>
        <section className="hs-card">
          <p className="hs-muted">
            {error || 'Loading the website record…'}
          </p>
          {error && (
            <button type="button" className="hs-button" onClick={() => void refresh()}>
              Try again
            </button>
          )}
        </section>
      </div>
    )
  }

  const { identity, domain: domainState, email, seo } = snapshot
  const mailStatus = (() => {
    if (email.mode === 'external') return 'Handled by another provider'
    const state = email.provisioning.state || ''
    if (state === 'active') return 'Sending and receiving on this domain'
    if (state === 'action_required') return 'Waiting for HelloAda to restore the mail connection'
    if (state === 'provisioning' || state === 'awaiting_runtime_release' || state === 'waiting_for_worker_release') {
      return 'Setting up'
    }
    if (state === 'domain_required') return 'Add a domain to use your own mailbox'
    return 'Not set up yet'
  })()
  const domainConfigured = Boolean(identity.registeredDomain) && !/\.workers\.dev$/i.test(identity.registeredDomain)
  const serving = domainState.serving

  return (
    <div className="hs-shell">
      <header className="hs-head">
        <p className="hs-eyebrow">Settings</p>
        <h1 className="hs-title">{snapshot.identity.displayName || websiteName}</h1>
        <p className="hs-lede">
          One record for this website&apos;s name, address, mail and search identity. Changing it here
          changes every surface that reads it.
        </p>
      </header>

      {(error || notice) && (
        <p className={error ? 'hs-alert hs-alert-error' : 'hs-alert'} role="status">
          {error || notice}
        </p>
      )}

      <div className="hs-grid">
        <section className="hs-card">
          <h2>Identity</h2>
          <form onSubmit={saveName}>
            <label className="hs-field">
              <span>Website name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </label>
            <button type="submit" className="hs-button" disabled={busy === 'name' || name.trim() === snapshot.identity.displayName}>
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>
          </form>
          <dl className="hs-facts">
            <div><dt>Address key</dt><dd>/{slug}</dd></div>
            <div><dt>Tenant id</dt><dd className="hs-mono">{identity.tenantId}</dd></div>
            <div><dt>Worker</dt><dd className="hs-mono">{identity.workerName || '—'}</dd></div>
          </dl>
          <p className="hs-hint">
            The tenant id is the immutable key behind this website&apos;s data, mail and releases.
            The address key is what people see; renaming it needs a redirect and is a separate change.
          </p>
        </section>

        <section className="hs-card">
          <h2>Domain</h2>
          {domainConfigured ? (
            <dl className="hs-facts">
              <div><dt>Registered domain</dt><dd>{identity.registeredDomain}</dd></div>
              <div><dt>Public address</dt><dd><a href={identity.publicUrl} target="_blank" rel="noreferrer">{identity.publicUrl}</a></dd></div>
              <div>
                <dt>Serving</dt>
                <dd>
                  <span className={serving.ok ? 'hs-pill hs-pill-ok' : 'hs-pill'}>
                    {serving.ok ? `200 (${serving.status})` : serving.status ? `HTTP ${serving.status}` : serving.reason || 'unreachable'}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Cloudflare zone</dt>
                <dd>{domainState.zone ? `${domainState.zone.name} · ${domainState.zone.status}` : domainState.reason || 'not found'}</dd>
              </div>
            </dl>
          ) : (
            <p className="hs-muted">
              This website is still served from its Worker address. Attach a domain that is already
              in the platform Cloudflare account and both the apex and www will point at it.
            </p>
          )}
          <form onSubmit={(event) => void attachDomain(event)}>
            <div className="hs-inline-form">
              <label className="hs-field">
                <span>Domain to attach</span>
                <input
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  placeholder="example.com"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="hs-field hs-field-narrow">
                <span>Canonical</span>
                <select value={canonical} onChange={(event) => setCanonical(event.target.value === 'apex' ? 'apex' : 'www')}>
                  <option value="www">www</option>
                  <option value="apex">apex</option>
                </select>
              </label>
              <button type="submit" className="hs-button" disabled={busy === 'domain' || !snapshot.capabilities.attachDomain}>
                {busy === 'domain' ? 'Attaching…' : domainConfigured ? 'Re-attach' : 'Attach domain'}
              </button>
            </div>
          </form>
          {conflict && (
            <div className="hs-conflict">
              <p className="hs-conflict-title">{conflict.hostname} needs a decision</p>
              <p className="hs-muted">{conflict.detail}</p>
              {conflict.kind === 'dns_record' && (
                <>
                  <ul className="hs-records">
                    {conflict.records.map((record) => (
                      <li key={`${record.type}-${record.name}-${record.content}`}>
                        <span className="hs-mono">{record.type}</span> {record.name} → {record.content}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="hs-button hs-button-danger"
                    disabled={busy === 'domain'}
                    onClick={() => void attachDomain(null, { replaceDns: true, takeover: true })}
                  >
                    Replace these DNS records
                  </button>
                </>
              )}
              {conflict.kind === 'custom_domain' && (
                <button
                  type="button"
                  className="hs-button hs-button-danger"
                  disabled={busy === 'domain'}
                  onClick={() => void attachDomain(null, { takeover: true })}
                >
                  Take {conflict.hostname} from {conflict.service || 'the other Worker'}
                </button>
              )}
            </div>
          )}
          {domainState.customDomains.length > 0 && (
            <ul className="hs-list">
              {domainState.customDomains.map((row) => (
                <li key={row.hostname}>
                  <span>{row.hostname}</span>
                  <span className="hs-muted">{row.service}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hs-card">
          <h2>Mail</h2>
          <form onSubmit={saveEmail}>
            <div className="hs-inline-form">
              <label className="hs-field">
                <span>Who handles mail</span>
                <select value={mode} onChange={(event) => setMode(event.target.value === 'external' ? 'external' : 'managed')}>
                  <option value="managed">HelloAda mailbox</option>
                  <option value="external">Another provider</option>
                </select>
              </label>
              {mode === 'external' && (
                <label className="hs-field">
                  <span>Provider</span>
                  <input value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="Google Workspace" maxLength={80} />
                </label>
              )}
            </div>
            {mode === 'managed' && (
              <div className="hs-inline-form">
                <label className="hs-field">
                  <span>Mailbox name</span>
                  <input
                    value={localPart}
                    onChange={(event) => setLocalPart(event.target.value)}
                    placeholder="hello"
                    maxLength={64}
                  />
                </label>
                <label className="hs-field">
                  <span>Mail domain</span>
                  <input
                    value={mailDomain}
                    onChange={(event) => setMailDomain(event.target.value)}
                    placeholder="yourdomain.com"
                    maxLength={253}
                  />
                </label>
              </div>
            )}
            <dl className="hs-facts">
              <div><dt>Mailbox</dt><dd>{email.mailbox.address || 'not provisioned'}</dd></div>
              <div><dt>Mail status</dt><dd>{mailStatus}</dd></div>
            </dl>
            {mode === 'managed' && email.provisioning.error && (
              <p className="hs-muted">{email.provisioning.error}</p>
            )}
            <label className="hs-field">
              <span>Notification email</span>
              <input
                type="email"
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                placeholder="owner@example.com"
                maxLength={254}
              />
            </label>
            <div className="hs-checks">
              <label><input type="checkbox" checked={inbound} onChange={(event) => setInbound(event.target.checked)} /> Tell me about new mail</label>
              <label><input type="checkbox" checked={external} onChange={(event) => setExternal(event.target.checked)} /> Tell me when mail is handled elsewhere</label>
            </div>
            <button type="submit" className="hs-button" disabled={busy === 'email'}>
              {busy === 'email' ? 'Saving…' : 'Save mail settings'}
            </button>
          </form>
        </section>

        <section className="hs-card">
          <h2>Search</h2>
          <dl className="hs-facts">
            <div><dt>Search Console property</dt><dd className="hs-mono">{seo.gscProperty || '—'}</dd></div>
            <div><dt>Property verified</dt><dd>{seo.gscVerified ? 'yes' : 'no'}</dd></div>
            <div><dt>CrawlSEO project</dt><dd className="hs-mono">{seo.projectId || 'not mapped'}</dd></div>
            <div><dt>CrawlSEO site</dt><dd className="hs-mono">{seo.siteId || 'not mapped'}</dd></div>
          </dl>
          <p className="hs-hint">
            These follow the domain. A domain property stays with the website when its address changes.
          </p>
        </section>

        <section className="hs-card hs-card-wide">
          <h2>Diagnostics</h2>
          <dl className="hs-facts hs-facts-grid">
            <div><dt>Worker address</dt><dd className="hs-mono">{identity.workerUrl || '—'}</dd></div>
            <div><dt>Public address</dt><dd className="hs-mono">{identity.publicUrl || '—'}</dd></div>
            <div><dt>Admin address</dt><dd className="hs-mono">{identity.adminUrl || '—'}</dd></div>
            <div><dt>Workspace address</dt><dd className="hs-mono">{identity.payloadUrl || '—'}</dd></div>
          </dl>
          <button type="button" className="hs-button hs-button-quiet" onClick={() => void refresh()} disabled={Boolean(busy)}>
            Re-read the record
          </button>
        </section>
      </div>
    </div>
  )
}
