import Link from 'next/link'
import './intelligence-summary.css'

type RecordValue = Record<string, unknown>
export type IntelligenceResult = { state: 'available'; data: RecordValue } | { state: 'not_started' } | { state: 'unavailable'; reason: string }

const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/^./, c => c.toUpperCase())
function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unknown'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.length ? value.map(display).join(', ') : 'None reported'
  if (typeof value === 'object') return Object.entries(value as RecordValue).map(([key, entry]) => `${label(key)}: ${display(entry)}`).join(' · ')
  return 'Unknown'
}
function fields(value: unknown) {
  return Object.entries(object(value)).filter(([key]) => !['url', 'href'].includes(key)).map(([key, item]) => <p key={key}><strong>{label(key)}:</strong> {display(item)}</p>)
}
function count(value: unknown, keys: string[]) {
  const source = object(value)
  for (const key of keys) if (typeof source[key] === 'number') return String(source[key])
  return 'Unknown'
}

export function IntelligenceSummary({ result }: { result: IntelligenceResult }) {
  if (result.state === 'not_started') return <section className="intelligence" aria-labelledby="intelligence-title">
    <div className="intelligence-heading"><span className="site-phase">Next step</span><h2 id="intelligence-title">Business intelligence</h2></div>
    <p role="status">Intelligence appears after intake and research. Continue with the intake below to get started.</p>
  </section>
  if (result.state === 'unavailable') return <section className="intelligence" aria-labelledby="intelligence-title">
    <div className="intelligence-heading"><span className="site-phase">Intelligence unavailable</span><h2 id="intelligence-title">Business intelligence</h2></div>
    <p role="status">Your intelligence is temporarily unavailable. {result.reason.replace(/\b(?:HTTP\s*)?\d{3}\b/gi, 'the service')}</p>
  </section>

  const data = result.data
  const research = object(data.research)
  const hasResearch = Object.keys(research).length > 0 && research.status !== 'not_started' && research.status !== 'none'
  const coverage = object(data.coverage)
  const visibility = object(data.visibility)
  const profileEnvelope = object(data.businessProfile)
  const profile = Object.keys(object(profileEnvelope.accepted)).length ? { ...profileEnvelope, ...object(profileEnvelope.accepted) } : profileEnvelope
  const actions = list(data.actions)
  return <section className="intelligence" aria-labelledby="intelligence-title">
    <div className="intelligence-heading"><span className="site-phase">Your business, understood</span><h2 id="intelligence-title">Business intelligence</h2></div>
    <div className="intelligence-grid">
      <article><h3>Accepted business profile</h3>
        {Object.keys(profile).length ? <>{fields(profile)}<p><strong>Revision:</strong> {display(profile.revision ?? profile.profileRevision)}</p><p><strong>Last changed:</strong> {display(profile.updatedAt ?? profile.lastChangedAt ?? profile.changedAt ?? profile.lastChanged)}</p></> : <p>No accepted profile is available yet.</p>}
      </article>
      <article><h3>Research</h3>
        {hasResearch ? <>{fields(research)}{list(research.findings ?? research.found).map((item, index) => <p key={index}>{display(item)}</p>)}{list(research.pending).map((item, index) => <p key={`p${index}`}><strong>Pending:</strong> {display(item)}</p>)}{list(research.blocked).map((item, index) => <p key={`b${index}`}><strong>Blocked:</strong> {display(item)}</p>)}</> : <p>No research has run yet. Complete your business profile to get started.</p>}
      </article>
      <article><h3>Question coverage</h3><p><strong>Answered:</strong> {count(coverage, ['answered', 'answeredCount'])}</p><p><strong>Waiting on you:</strong> {count(coverage, ['waitingOnOwner', 'waiting', 'waitingCount'])}</p>{fields(coverage)}</article>
      <article><h3>AI visibility</h3><p><strong>Observed:</strong> {display(visibility.observed)}</p><p><strong>Unknown:</strong> {Array.isArray(visibility.unknown) && visibility.unknown.length === 0 ? 'Not reported' : display(visibility.unknown)}</p>{fields(visibility)}</article>
    </div>
    <div className="intelligence-actions"><h3>Outstanding actions</h3>
      {actions.length ? <ul>{actions.map((item, index) => { const action = object(item); const surface = object(action.surface); const href = typeof action.href === 'string' ? action.href : typeof action.url === 'string' ? action.url : typeof surface.href === 'string' ? surface.href : null; return <li key={String(action.id || index)}>{href ? <Link href={href}>{display(action.title ?? action.label ?? action.name ?? action.description)}</Link> : display(action.title ?? action.label ?? action.name ?? action.description)}{action.status ? ` · ${display(action.status)}` : ''}</li> })}</ul> : <p>No outstanding actions reported.</p>}
    </div>
  </section>
}
