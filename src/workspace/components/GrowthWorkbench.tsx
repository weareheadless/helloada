'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { fetchHelloAda } from '../api/fetchHelloAda'
import { useHelloAdaTranslations } from '../api/useHelloAdaTranslations'
import { WorkspaceIcon } from './WorkspaceIcon'

/**
 * The Growth workbench.
 *
 * One ledger: the Opportunity is the unit of work, and the three modes are the
 * three things the connector exposes — the decision queue, the tasks those
 * decisions create, and the measurements already saved. Everything rendered
 * here comes from the connector envelope; nothing is inferred from a title or
 * a dedup key, and an unavailable connector is shown as unavailable instead of
 * as an empty page.
 */

type ConnectorTask = {
  id: string
  opportunityId: string
  title: string
  assignedTo: string
  status: string
  humanConfirmedBy?: string | null
  humanConfirmedAt?: string | null
  updatedAt: string
}

type Opportunity = {
  id: string
  type: string
  status: string
  dimension: string
  title: string
  summary: string
  dedupKey: string
  scoreValue: number | null
  scoreInputs: Record<string, unknown> | null
  recommendationDecision: Record<string, unknown> | null
  recommendationVersion: string | null
  evidenceCompleteness: string
  assessmentVersion: number
  firstDetectedAt: string
  decidedBy: string | null
  decidedAt: string | null
  parkReason: string | null
  updatedAt: string
  pageUrl: string | null
  newPage: boolean | null
  queries: string[]
  tasks: ConnectorTask[]
}

type OpportunityPage = {
  schemaVersion?: string
  projectId?: string
  siteId?: string
  opportunities?: Opportunity[]
  counts?: Record<string, number> | null
  nextCursor?: string | null
}

type Analytics = {
  authority?: string
  status?: string
  reason?: string
  requestedPeriod?: { startDate?: string; endDate?: string } | null
  ga4?: Record<string, unknown> | null
  gsc?: Record<string, unknown> | null
}

type LocalBinding = {
  taskId: string
  opportunityId: string
  title: string | null
  pageUrl: string | null
  groupId: string | null
  conversationId: number | null
  draftId: number | null
  draftStatus: string | null
  state: 'open' | 'working' | 'awaiting' | 'live' | 'resolved' | 'cancelled'
  links: Record<string, string>
}

type LocalGroup = {
  id: string
  title: string | null
  taskIds: string[]
  opportunityIds: string[]
  conversationId: number | null
  draftId: number | null
  state: 'open' | 'working' | 'awaiting' | 'live' | 'resolved' | 'cancelled'
  links: Record<string, string>
}

type Bindings = { bindings?: LocalBinding[]; groups?: LocalGroup[] }

type Mode = 'opportunities' | 'work' | 'analytics'
type WorkState = 'open' | 'working' | 'awaiting' | 'live' | 'resolved'

/** Findings whose fix is technical may be fixed together; content never is. */
const GROUPABLE_TYPES = new Set(['O7', 'O8', 'O12'])
const groupable = (row: Opportunity) => GROUPABLE_TYPES.has(row.type.slice(0, 2))

const PAGE_LIMIT = 100
/** Bounded read: the connector reports the true total, so a capped read is stated. */
const MAX_PAGES = 6

const TYPE_LABEL: Record<string, string> = {
  O1: 'Winnable rank',
  O2: 'Striking distance',
  O3: 'Content gap',
  O4: 'AEO citation gap',
  O5: 'AEO presence gap',
  O6: 'Business fact mismatch',
  O7: 'Technical defect',
  O8: 'Structured data gap',
  O9: 'Backlink gap',
  O10: 'Cannibalisation',
  O11: 'Freshness decay',
  O12: 'Page experience',
  O13: 'User pain point',
  O14: 'Offer positioning',
}

/** A task's assignee is a principal id; show which owner, not the whole path. */
function assigneeLabel(value: string, owner: string): string {
  const match = value.match(/^(?:payload|helloada):(?:[^:]+:)?(.+)$/)
  return match ? `${owner} ${match[1]}` : value
}

const typeLabel = (type: string) => TYPE_LABEL[type.slice(0, 2)] || type
const typeTone = (dimension: string) =>
  dimension === 'technical' ? 'technical' : dimension === 'content' ? 'content'
    : dimension === 'aeo' || dimension === 'geo' ? 'aeo' : 'seo'

const newKey = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`

async function failure(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body?.detail ?? body?.message ?? body?.error
    if (typeof detail === 'string' && detail.trim()) return detail
  } catch {
    /* a non-JSON failure still needs a message */
  }
  return `HTTP ${response.status}`
}

export function GrowthWorkbench() {
  const { t, language } = useHelloAdaTranslations()
  const [rows, setRows] = useState<Opportunity[]>([])
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [total, setTotal] = useState(0)
  const [envelope, setEnvelope] = useState<{ projectId?: string; siteId?: string; schemaVersion?: string }>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [local, setLocal] = useState<Bindings>({})
  const [mode, setMode] = useState<Mode>('opportunities')
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [showParked, setShowParked] = useState(false)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsPhase, setAnalyticsPhase] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setError(null)
    try {
      const collected: Opportunity[] = []
      let cursor: string | null = null
      let seen: Record<string, number> | null = null
      let pages = 0
      do {
        const query = `/api/helloada/growth/opportunities?limit=${PAGE_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
        const response = await fetchHelloAda(query, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(await failure(response))
        const page = (await response.json()) as OpportunityPage
        if (!seen && page.counts) seen = page.counts
        if (page.projectId || page.siteId) {
          setEnvelope({ projectId: page.projectId, siteId: page.siteId, schemaVersion: page.schemaVersion })
        }
        collected.push(...(page.opportunities || []))
        cursor = page.nextCursor || null
        pages += 1
      } while (cursor && pages < MAX_PAGES)
      setRows(collected)
      setCounts(seen)
      setTotal(seen?.total ?? collected.length)
      setSelectedId((current) =>
        current && collected.some((row) => row.id === current) ? current : collected.find((row) => row.status === 'detected')?.id ?? null,
      )
      setSyncedAt(new Date().toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }))
      setPhase('ready')
    } catch (exception) {
      if ((exception as Error)?.name === 'AbortError') return
      setPhase('failed')
      setError((exception as Error)?.message || 'Unknown error')
    }
  }, [language])

  const loadAnalytics = useCallback(async () => {
    try {
      const response = await fetchHelloAda('/api/helloada/seo/analytics?days=90', { cache: 'no-store' })
      if (!response.ok) throw new Error(await failure(response))
      setAnalytics((await response.json()) as Analytics)
      setAnalyticsPhase('ready')
    } catch (exception) {
      setAnalyticsPhase('failed')
      setError((exception as Error)?.message || 'Unknown error')
    }
  }, [])

  const loadBindings = useCallback(async () => {
    try {
      const response = await fetchHelloAda('/api/helloada/growth/bindings', { cache: 'no-store' })
      if (response.ok) setLocal((await response.json()) as Bindings)
    } catch {
      // The connector board stays readable without the local binding ledger.
    }
  }, [])

  useEffect(() => {
    // The workbench opens on its own read; the connector is the only source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBindings()
    return () => request.current?.abort()
  }, [load, loadBindings])

  useEffect(() => {
    if (mode === 'analytics' && analyticsPhase === 'idle') {
      // Performance is read on first open, not on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadAnalytics()
    }
  }, [mode, analyticsPhase, loadAnalytics])

  const decide = async (row: Opportunity, operation: 'accept' | 'park' | 'reject') => {
    setBusy(`${row.id}:${operation}`)
    setNotice(null)
    try {
      const decisionId = (row.recommendationDecision as { decisionId?: string } | null)?.decisionId
      const response = await fetchHelloAda(`/api/helloada/growth/opportunities/${encodeURIComponent(row.id)}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          operation,
          expectedUpdatedAt: row.updatedAt,
          ...(decisionId ? { expectedDecisionId: decisionId } : {}),
          idempotencyKey: `ui:${row.id}:${newKey()}`,
          confirmationRef: `ui:opportunity/${row.id}/${newKey()}`,
        }),
      })
      if (!response.ok) throw new Error(await failure(response))
      setNotice(t('growth.workbench.decided'))
      await load()
    } catch (exception) {
      setNotice(`${t('growth.workbench.decisionFailed')}: ${(exception as Error)?.message ?? ''}`)
      // A refused decision means this page showed a version the connector no
      // longer holds. Re-read so the reading pane shows what is current.
      await load()
    } finally {
      setBusy(null)
    }
  }

  const conversationHref = (conversationId: number | null | undefined) => {
    const url = new URL(window.location.href)
    url.search = ''
    if (conversationId) url.searchParams.set('conversation_id', String(conversationId))
    return url.toString()
  }

  const openConversation = (conversationId: number | null | undefined) => {
    window.location.assign(conversationHref(conversationId))
  }

  /** One click: the finding becomes a brief in Ada's workspace. */
  const fixWithAda = async (row: Opportunity) => {
    setBusy(`${row.id}:open`)
    setNotice(null)
    try {
      const response = await fetchHelloAda(`/api/helloada/growth/opportunities/${encodeURIComponent(row.id)}/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!response.ok) throw new Error(await failure(response))
      const body = (await response.json()) as { conversationId?: number; taskId?: string }
      await load()
      await loadBindings()
      openConversation(body.conversationId)
    } catch (exception) {
      setNotice(`${t('growth.workbench.openFailed')}: ${(exception as Error)?.message ?? ''}`)
      await load()
      await loadBindings()
    } finally {
      setBusy(null)
    }
  }

  /** Technical findings only, 2-10, one conversation and one release. */
  const fixSelected = async () => {
    if (checked.length < 2) return
    setBusy('group:open')
    setNotice(null)
    try {
      const response = await fetchHelloAda('/api/helloada/growth/groups', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ opportunityIds: checked }),
      })
      if (!response.ok) throw new Error(await failure(response))
      const body = (await response.json()) as { conversationId?: number }
      setChecked([])
      await load()
      await loadBindings()
      openConversation(body.conversationId)
    } catch (exception) {
      setNotice(`${t('growth.workbench.openFailed')}: ${(exception as Error)?.message ?? ''}`)
      await load()
      await loadBindings()
    } finally {
      setBusy(null)
    }
  }

  const askAdaToAnalyse = (prompt: string) => {
    const url = new URL(window.location.href)
    url.search = ''
    url.searchParams.set('ask', prompt.slice(0, 8000))
    window.location.assign(url.toString())
  }

  const bindingsByOpportunity = useMemo(() => {
    const map = new Map<string, LocalBinding>()
    for (const binding of local.bindings || []) map.set(binding.opportunityId, binding)
    return map
  }, [local])

  const stateFor = useCallback((row: Opportunity): WorkState => {
    const binding = bindingsByOpportunity.get(row.id)
    const task = row.tasks[0]
    if (task?.status === 'verified_outcome' || binding?.state === 'resolved') return 'resolved'
    if (binding?.state === 'live' || task?.status === 'delivered') return 'live'
    if (binding?.state === 'awaiting' || task?.status === 'awaiting_human' || binding?.draftStatus === 'pending') return 'awaiting'
    if (binding || task) return 'working'
    return 'open'
  }, [bindingsByOpportunity])

  const groups = useMemo(() => {
    const by = (status: string) => rows.filter((row) => row.status === status)
    const decisionRows = [...by('detected'), ...by('parked')]
    const taskRows = rows.flatMap((row) => row.tasks.map((task) => ({ task, opportunity: row })))
    const counts: Record<WorkState, number> = { open: 0, working: 0, awaiting: 0, live: 0, resolved: 0 }
    for (const row of rows) {
      if (['parked', 'rejected', 'closed'].includes(row.status)) continue
      counts[stateFor(row)] += 1
    }
    return {
      decide: by('detected'),
      parked: by('parked'),
      decisionRows,
      tasks: taskRows,
      counts,
      groups: local.groups || [],
      bindings: local.bindings || [],
      unbound: taskRows.filter(({ task }) => !(local.bindings || []).some((binding) => binding.taskId === task.id)),
    }
  }, [rows, local, stateFor])

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const selectedTask = selected ? groups.tasks.find(({ opportunity }) => opportunity.id === selected.id)?.task ?? null : null
  const selectedBinding = selected ? bindingsByOpportunity.get(selected.id) ?? null : null

  const pipeline: Array<{ key: string; label: string; value: number; hot?: boolean }> = [
    { key: 'open', label: t('growth.workbench.stateOpen'), value: groups.counts.open, hot: true },
    { key: 'working', label: t('growth.workbench.stateWorking'), value: groups.counts.working },
    { key: 'awaiting', label: t('growth.workbench.stateAwaiting'), value: groups.counts.awaiting },
    { key: 'live', label: t('growth.workbench.stateLive'), value: groups.counts.live },
    { key: 'resolved', label: t('growth.workbench.stateResolved'), value: groups.counts.resolved },
  ]

  const date = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleDateString(language, { day: 'numeric', month: 'short' })
      : '—'
  const number = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat(language).format(value) : null

  return (
    <div className="helloada-growth gw">
      <header className="gw-top">
        <div>
          <div className="gw-eyebrow">{t('growth.workbench.title')} · CrawlSEO</div>
          <h1>{t('growth.workbench.title')}</h1>
          <p>{t('growth.workbench.subtitle')}</p>
        </div>
        <div className="gw-top-status">
          {phase === 'failed' ? (
            <span className="gw-chip gw-chip-warn"><i />{t('growth.workbench.loadFailed')}</span>
          ) : phase === 'loading' ? (
            <span className="gw-chip gw-chip-warn"><i />{t('growth.workbench.loading')}</span>
          ) : (
            <span className="gw-chip"><i />{envelope.schemaVersion ? `connector v${envelope.schemaVersion}` : t('growth.workbench.updated')}</span>
          )}
          {syncedAt ? <span className="gw-synced">{t('growth.workbench.updated')} {syncedAt}</span> : null}
          <button type="button" className="gw-icon" onClick={() => void load()} aria-label={t('growth.workbench.refresh')}>
            <WorkspaceIcon name="refresh" />
          </button>
        </div>
      </header>

      <div className="gw-pipeline">
        {pipeline.map((item) => (
          <div className={item.hot ? 'gw-pipe gw-pipe-hot' : 'gw-pipe'} key={item.key}>
            <b>{number(item.value) ?? 0}</b>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      <nav className="gw-modes" aria-label={t('growth.workbench.title')}>
        <button type="button" aria-pressed={mode === 'opportunities'} onClick={() => setMode('opportunities')}>
          {t('growth.workbench.modeOpportunities')}<b>{number(total) ?? rows.length}</b>
        </button>
        <button type="button" aria-pressed={mode === 'work'} onClick={() => setMode('work')}>
          {t('growth.workbench.modeWork')}<b>{groups.counts.working + groups.counts.awaiting}</b>
        </button>
        <button type="button" aria-pressed={mode === 'analytics'} onClick={() => setMode('analytics')}>
          {t('growth.workbench.modeAnalytics')}
        </button>
      </nav>

      {notice ? <p className="gw-notice" role="status">{notice}</p> : null}

      {phase === 'failed' ? (
        <section className="gw-fail">
          <h2>{t('growth.workbench.loadFailed')}</h2>
          <p>{error}</p>
          <button type="button" className="gw-button" onClick={() => { setPhase('loading'); void load() }}>{t('growth.workbench.retry')}</button>
        </section>
      ) : phase === 'loading' && rows.length === 0 ? (
        <section className="gw-fail"><p>{t('growth.workbench.loading')}</p></section>
      ) : mode === 'analytics' ? (
        <Analytics
          analytics={analytics}
          phase={analyticsPhase}
          error={error}
          onRetry={() => void loadAnalytics()}
          onAsk={askAdaToAnalyse}
          t={t}
          number={number}
          language={language}
        />
      ) : mode === 'work' ? (
        <Work
          groups={groups.groups}
          bindings={groups.bindings}
          unbound={groups.unbound}
          stateFor={stateFor}
          t={t}
          date={date}
          openConversation={openConversation}
          onOpen={(id) => { setSelectedId(id); setMode('opportunities') }}
        />
      ) : (
        <div className="gw-body">
          <aside className="gw-queue" aria-label={t('growth.workbench.queueDecide')}>
            <div className="gw-qhead"><span>{t('growth.workbench.queueDecide')}</span><b>{groups.decide.length}</b></div>
            {checked.length ? (
              <div className="gw-groupbar">
                <span>{t('growth.workbench.groupHint').replace('{n}', String(checked.length))}</span>
                <button
                  type="button"
                  className="gw-button gw-button-primary"
                  disabled={checked.length < 2 || busy !== null}
                  onClick={() => void fixSelected()}
                >
                  {busy === 'group:open' ? t('growth.workbench.opening') : t('growth.workbench.fixSelected')}
                </button>
              </div>
            ) : null}
            {groups.decide.length === 0 ? (
              <div className="gw-empty">
                <strong>{t('growth.workbench.emptyQueue')}</strong>
                <p>{t('growth.workbench.emptyQueueBody')}</p>
              </div>
            ) : (
              groups.decide.map((row) => {
                const selectable = groupable(row)
                const isChecked = checked.includes(row.id)
                return (
                <button
                  type="button"
                  key={row.id}
                  className={row.id === selectedId ? 'gw-row gw-row-selected' : 'gw-row'}
                  onClick={() => setSelectedId(row.id)}
                  aria-pressed={row.id === selectedId}
                >
                  <span className="gw-row-meta">
                    {selectable ? (
                      <span
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-label={t('growth.workbench.selectForGroup')}
                        tabIndex={0}
                        className={isChecked ? 'gw-check gw-check-on' : 'gw-check'}
                        onClick={(event) => {
                          event.stopPropagation()
                          setChecked((current) => current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : current.length >= 10 ? current : [...current, row.id])
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          setChecked((current) => current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : current.length >= 10 ? current : [...current, row.id])
                        }}
                      />
                    ) : null}
                    <span className={`gw-type gw-type-${typeTone(row.dimension)}`}>{typeLabel(row.type)}</span>
                    {typeof row.scoreValue === 'number' ? <span className="gw-score">{row.scoreValue}</span> : null}
                  </span>
                  <strong>{row.title}</strong>
                  <small>
                    {number((row.scoreInputs as { worth?: { volume?: unknown } } | null)?.worth?.volume) ?? '—'}
                    {row.pageUrl ? ` · ${pathLabel(row.pageUrl)}` : ''}
                  </small>
                </button>
                )
              })
            )}

            <div className="gw-divider">
              <span>{t('growth.workbench.queueParked')}</span><b>{groups.parked.length}</b>
            </div>
            {groups.parked.length === 0 ? (
              <div className="gw-empty gw-empty-tight"><strong>{t('growth.workbench.emptyParked')}</strong></div>
            ) : (
              <>
                {(showParked ? groups.parked : groups.parked.slice(0, 5)).map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    className={row.id === selectedId ? 'gw-row gw-row-parked gw-row-selected' : 'gw-row gw-row-parked'}
                    onClick={() => setSelectedId(row.id)}
                    aria-pressed={row.id === selectedId}
                  >
                    <span className="gw-row-meta">
                      <span className={`gw-type gw-type-${typeTone(row.dimension)}`}>{typeLabel(row.type)}</span>
                    </span>
                    <strong>{row.title}</strong>
                    {row.parkReason ? <small>{row.parkReason}</small> : null}
                  </button>
                ))}
                {groups.parked.length > 5 ? (
                  <button type="button" className="gw-more" onClick={() => setShowParked((value) => !value)}>
                    {showParked ? t('growth.workbench.showLess') : `${t('growth.workbench.showMore')} (${groups.parked.length - 5})`}
                  </button>
                ) : null}
              </>
            )}

            {rows.length < total ? (
              <p className="gw-truncated">
                {t('growth.workbench.truncated').replace('{shown}', String(rows.length)).replace('{total}', String(total))}
              </p>
            ) : null}
          </aside>

          <section className="gw-detail" aria-label={selected?.title ?? t('growth.workbench.detailSelect')}>
            {selected ? (
              <Detail
                row={selected}
                task={selectedTask}
                binding={selectedBinding}
                state={stateFor(selected)}
                busy={busy}
                decide={decide}
                fixWithAda={fixWithAda}
                openConversation={openConversation}
                t={t}
                date={date}
                number={number}
              />
            ) : (
              <div className="gw-empty">
                <strong>{t('growth.workbench.detailSelect')}</strong>
                <p>{t('growth.workbench.detailSelectBody')}</p>
              </div>
            )}
          </section>
        </div>
      )}

      <footer className="gw-footer">
        <span><b>CrawlSEO connector</b></span>
        {envelope.siteId ? <span>site {envelope.siteId}</span> : null}
        {envelope.projectId ? <span>project {envelope.projectId}</span> : null}
      </footer>
    </div>
  )
}

type Copy = (key: string) => string

function stateLabel(state: WorkState, t: Copy) {
  switch (state) {
    case 'open': return t('growth.workbench.stateOpen')
    case 'working': return t('growth.workbench.stateWorking')
    case 'awaiting': return t('growth.workbench.stateAwaiting')
    case 'live': return t('growth.workbench.stateLive')
    default: return t('growth.workbench.stateResolved')
  }
}

function Detail({
  row,
  task,
  binding,
  state,
  busy,
  decide,
  fixWithAda,
  openConversation,
  t,
  date,
  number,
}: {
  row: Opportunity
  task: ConnectorTask | null
  binding: LocalBinding | null
  state: WorkState
  busy: string | null
  decide: (row: Opportunity, operation: 'accept' | 'park' | 'reject') => Promise<void>
  fixWithAda: (row: Opportunity) => Promise<void>
  openConversation: (conversationId: number | null | undefined) => void
  t: Copy
  date: (value: string | null | undefined) => string
  number: (value: unknown) => string | null
}) {
  const worth = (row.scoreInputs as { worth?: Record<string, unknown> } | null)?.worth ?? {}
  const effort = (row.scoreInputs as { effort?: Record<string, unknown> } | null)?.effort ?? {}
  const evidence =
    row.evidenceCompleteness === 'both' ? t('growth.workbench.evidenceBoth')
      : row.evidenceCompleteness === 'why' ? t('growth.workbench.evidenceWhy')
        : row.evidenceCompleteness === 'how' ? t('growth.workbench.evidenceHow')
          : t('growth.workbench.evidenceNone')
  const size = typeof effort.sizeFactor === 'number' ? effort.sizeFactor : null
  const effortLabel = size === null ? '—' : size <= 1 ? 'Small' : size <= 2 ? 'Medium' : 'Large'
  const decision = (row.recommendationDecision ?? {}) as { readiness?: unknown; confidence?: unknown }
  const readinessLabel =
    decision.readiness === 'actionable' ? t('growth.workbench.readinessActionable')
      : decision.readiness === 'needs_investigation' ? t('growth.workbench.readinessInvestigation')
        : '—'
  const confidenceLabel =
    decision.confidence === 'high' ? `${t('growth.workbench.confidence')} ${t('growth.workbench.confidenceHigh')}`
      : decision.confidence === 'medium' ? `${t('growth.workbench.confidence')} ${t('growth.workbench.confidenceMedium')}`
        : decision.confidence === 'low' ? `${t('growth.workbench.confidence')} ${t('growth.workbench.confidenceLow')}`
          : ''
  const links = binding?.links ?? {}
  const conversation = binding?.conversationId ?? null

  return (
    <article className="gw-article">
      <div className="gw-detail-meta">
        <span className={`gw-type gw-type-${typeTone(row.dimension)}`}>{typeLabel(row.type)}</span>
        <span className={`gw-state gw-state-${state}`}>{stateLabel(state, t)}</span>
        <span className="gw-seen">{t('growth.workbench.firstSeen')} {date(row.firstDetectedAt)}</span>
      </div>

      <h2>{row.title}</h2>
      <p className="gw-summary">{row.summary}</p>

      {row.pageUrl ? (
        <p className="gw-anchor">
          <span>{t('growth.workbench.page')}</span>
          <a href={row.pageUrl} target="_blank" rel="noreferrer">{pathLabel(row.pageUrl)}</a>
          {row.newPage ? <em>{t('growth.workbench.newPage')}</em> : null}
        </p>
      ) : null}

      {row.queries.length ? (
        <p className="gw-anchor">
          <span>{t('growth.workbench.queries')}</span>
          {row.queries.map((query) => <em key={query} className="gw-query">{query}</em>)}
        </p>
      ) : null}

      <div className="gw-scoreblock">
        <div className="gw-scorebig">
          {number(row.scoreValue) ?? '—'}
          <small>priority</small>
        </div>
        <div className="gw-why">
          <div>
            <span>{t('growth.workbench.demand')}</span>
            <strong>{number(worth.volume) ?? '—'}</strong>
            <small>{typeof worth.volumeSource === 'string' ? worth.volumeSource.replace('_', ' ') : ''}</small>
          </div>
          <div>
            <span>{t('growth.workbench.effort')}</span>
            <strong>{effortLabel}</strong>
            <small>{typeof worth.intervention === 'string' ? worth.intervention.replace(/_/g, ' ') : ''}</small>
          </div>
          <div>
            <span>{t('growth.workbench.evidence')}</span>
            <strong>{evidence}</strong>
            <small>{row.assessmentVersion ? `v${row.assessmentVersion}` : ''}</small>
          </div>
          <div>
            <span>{t('growth.workbench.assessment')}</span>
            <strong>{readinessLabel}</strong>
            <small>{confidenceLabel}</small>
          </div>
        </div>
      </div>

      <div className="gw-handoff">
        <strong>{stateLabel(state, t)}</strong>
        <span>
          {state === 'open' ? t('growth.workbench.openNote')
            : state === 'working' ? t('growth.workbench.workingNote')
              : state === 'awaiting' ? t('growth.workbench.awaitingNote')
                : state === 'live' ? t('growth.workbench.liveNote')
                  : t('growth.workbench.resolvedNote')}
        </span>
        <div className="gw-actions">
          {state === 'open' ? (
            <button
              type="button"
              className="gw-button gw-button-primary"
              disabled={busy !== null}
              onClick={() => void fixWithAda(row)}
            >
              {busy === `${row.id}:open` ? t('growth.workbench.opening') : t('growth.workbench.fixWithAda')}
            </button>
          ) : (
            <button type="button" className="gw-button gw-button-primary" onClick={() => openConversation(conversation)}>
              {t('growth.workbench.openConversation')}
            </button>
          )}
          {links.live ? (
            <a className="gw-button" href={links.live} target="_blank" rel="noreferrer">{t('growth.workbench.viewLive')}</a>
          ) : null}
          {links.commit ? (
            <a className="gw-button" href={links.commit} target="_blank" rel="noreferrer">{t('growth.workbench.viewCommit')}</a>
          ) : null}
          {state === 'open' ? (
            <>
              <button type="button" className="gw-button" disabled={busy !== null} onClick={() => void decide(row, 'park')}>
                {t('growth.workbench.park')}
              </button>
              <button type="button" className="gw-button gw-button-quiet" disabled={busy !== null} onClick={() => void decide(row, 'reject')}>
                {t('growth.workbench.reject')}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="gw-timeline">
        <div><b>{t('growth.workbench.detected')}</b><span>{date(row.firstDetectedAt)}</span></div>
        {binding ? <div><b>{t('growth.workbench.conversation')}</b><span>#{conversation ?? '—'}{binding.draftId ? ` · draft #${binding.draftId}` : ''}</span></div> : null}
        <div><b>{t('growth.workbench.task')}</b><span>{task ? `${stateLabel(state, t)} · ${date(task.updatedAt)}` : t('growth.workbench.noTask')}</span></div>
        {row.decidedAt ? <div><b>{t('growth.workbench.decidedAt')}</b><span>{date(row.decidedAt)}{row.decidedBy ? ` · ${row.decidedBy}` : ''}</span></div> : null}
      </div>
    </article>
  )
}

function Work({
  groups,
  bindings,
  unbound,
  stateFor,
  t,
  date,
  openConversation,
  onOpen,
}: {
  groups: LocalGroup[]
  bindings: LocalBinding[]
  unbound: Array<{ task: ConnectorTask; opportunity: Opportunity }>
  stateFor: (row: Opportunity) => WorkState
  t: Copy
  date: (value: string | null | undefined) => string
  openConversation: (conversationId: number | null | undefined) => void
  onOpen: (opportunityId: string) => void
}) {
  const grouped = new Set(groups.flatMap((group) => group.taskIds))
  const single = bindings.filter((binding) => !binding.groupId && !grouped.has(binding.taskId))
  const empty = groups.length === 0 && single.length === 0 && unbound.length === 0

  const links = (links: Record<string, string> | undefined) => (
    <>
      {links?.live ? <a className="gw-button" href={links.live} target="_blank" rel="noreferrer">{t('growth.workbench.viewLive')}</a> : null}
      {links?.commit ? <a className="gw-button" href={links.commit} target="_blank" rel="noreferrer">{t('growth.workbench.viewCommit')}</a> : null}
    </>
  )

  if (empty) {
    return (
      <section className="gw-fail">
        <h2>{t('growth.workbench.workEmpty')}</h2>
        <p>{t('growth.workbench.workEmptyBody')}</p>
      </section>
    )
  }

  return (
    <section className="gw-work">
      {groups.map((group) => (
        <article className="gw-task gw-task-group" key={group.id}>
          <div className="gw-detail-meta">
            <span className={`gw-state gw-state-${group.state}`}>{stateLabel(group.state === 'cancelled' ? 'open' : group.state, t)}</span>
            <span className="gw-type gw-type-technical">{t('growth.workbench.groupBadge').replace('{n}', String(group.taskIds.length))}</span>
            <span className="gw-seen">{date(group.links.updatedAt)}</span>
          </div>
          <h3>{group.title}</h3>
          <p className="gw-summary">{t('growth.workbench.groupFor')} {group.opportunityIds.length} {t('growth.workbench.findings')}</p>
          <div className="gw-actions">
            <button type="button" className="gw-button gw-button-primary" onClick={() => openConversation(group.conversationId)}>
              {t('growth.workbench.openConversation')}
            </button>
            {links(group.links)}
          </div>
        </article>
      ))}
      {single.map((binding) => (
        <article className="gw-task" key={binding.taskId}>
          <div className="gw-detail-meta">
            <span className={`gw-state gw-state-${binding.state}`}>{stateLabel(binding.state === 'cancelled' ? 'open' : binding.state, t)}</span>
            <span className="gw-seen">{binding.pageUrl ? pathLabel(binding.pageUrl) : ''}</span>
          </div>
          <h3>{binding.title || binding.taskId}</h3>
          <div className="gw-actions">
            <button type="button" className="gw-button gw-button-primary" onClick={() => openConversation(binding.conversationId)}>
              {t('growth.workbench.openConversation')}
            </button>
            {links(binding.links)}
            {binding.opportunityId ? (
              <button type="button" className="gw-link" onClick={() => onOpen(binding.opportunityId)}>{t('growth.workbench.readFinding')}</button>
            ) : null}
          </div>
        </article>
      ))}
      {unbound.map(({ task, opportunity }) => (
        <article className="gw-task" key={task.id}>
          <div className="gw-detail-meta">
            <span className={`gw-state gw-state-${stateFor(opportunity)}`}>{stateLabel(stateFor(opportunity), t)}</span>
            <span className="gw-seen">{date(task.updatedAt)}</span>
          </div>
          <h3>{task.title}</h3>
          <p className="gw-summary">{t('growth.workbench.taskFor')} <button type="button" className="gw-link" onClick={() => onOpen(opportunity.id)}>{opportunity.title}</button></p>
          <p className="gw-note">{t('growth.workbench.acceptedElsewhere')}</p>
        </article>
      ))}
    </section>
  )
}

function connectionLabel(status: unknown, t: Copy) {
  switch (status) {
    case 'connected': return t('growth.workbench.connectionConnected')
    case 'ambiguous': return t('growth.workbench.connectionAmbiguous')
    case 'revoked': return t('growth.workbench.connectionRevoked')
    case 'needs_reauth': return t('growth.workbench.connectionNeedsReauth')
    case 'error': return t('growth.workbench.connectionError')
    default: return t('growth.workbench.connectionUnconnected')
  }
}

/** A saved page path can be a signed preview route; clip it for reading. */
function pathLabel(value: string): string {
  let label = value
  try {
    const url = new URL(value)
    label = url.pathname === '/' ? url.hostname.replace(/^www\./, '') : url.pathname
  } catch {
    label = value
  }
  return label.length > 64 ? `${label.slice(0, 61)}…` : label
}

function sum(rows: unknown, field: string): number {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((total, row) => {
    const value = (row as Record<string, unknown> | null)?.[field]
    return total + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  }, 0)
}

type TrendPoint = { date: string; a: number; b: number }

function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function shiftDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return isoDay(date)
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = []
  for (let day = start; day <= end && out.length < 400; day = shiftDays(day, 1)) out.push(day)
  return out
}

function pctChange(current: number, previous: number): number | null {
  return previous ? Math.round(((current - previous) / previous) * 1000) / 10 : null
}

/** Two independently scaled series in one honest chart: each line is read on
 * its own scale, so a 2-impression day is visible next to 0 clicks. */
function TrendChart({ points, labels, names, colors }: {
  points: TrendPoint[]
  labels: string[]
  names: [string, string]
  colors: [string, string]
}) {
  if (points.length < 2) return <p className="gw-note">{labels[0]}</p>
  const width = 620
  const height = 190
  const pad = 8
  const maxA = Math.max(1, ...points.map((point) => point.a))
  const maxB = Math.max(1, ...points.map((point) => point.b))
  const x = (index: number) => pad + (index / (points.length - 1)) * (width - pad * 2)
  const yA = (value: number) => height - pad - (value / maxA) * (height - pad * 2)
  const yB = (value: number) => height - pad - (value / maxB) * (height - pad * 2)
  const line = (select: (point: TrendPoint) => number, scale: (value: number) => number) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${scale(select(point)).toFixed(1)}`).join(' ')
  const first = points[0]
  const last = points[points.length - 1]

  return (
    <div className="gw-chart">
      <div className="gw-legend">
        <span><i style={{ background: colors[0] }} />{names[0]}</span>
        <span><i style={{ background: colors[1] }} />{names[1]}</span>
        <em>{first.date} → {last.date}</em>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${names[0]} and ${names[1]}`}>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1={pad} x2={width - pad} y1={pad + ratio * (height - pad * 2)} y2={pad + ratio * (height - pad * 2)} className="gw-grid" />
        ))}
        <path d={`${line((point) => point.b, yB)} L${x(points.length - 1)},${height - pad} L${x(0)},${height - pad} Z`} fill={colors[1]} opacity="0.08" />
        <path d={line((point) => point.b, yB)} fill="none" stroke={colors[1]} strokeWidth="1.8" />
        <path d={line((point) => point.a, yA)} fill="none" stroke={colors[0]} strokeWidth="2.2" />
        {points.map((point, index) => (
          <circle key={point.date} cx={x(index)} cy={yA(point.a)} r="2">
            <title>{`${point.date} · ${names[0]}: ${point.a}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

function Analytics({
  analytics,
  phase,
  error,
  onRetry,
  onAsk,
  t,
  number,
  language,
}: {
  analytics: Analytics | null
  phase: 'idle' | 'loading' | 'ready' | 'failed'
  error: string | null
  onRetry: () => void
  onAsk: (prompt: string) => void
  t: Copy
  number: (value: unknown) => string | null
  language: string
}) {
  const [days, setDays] = useState(28)
  if (phase === 'loading' || phase === 'idle') {
    return <section className="gw-fail"><p>{t('growth.workbench.loading')}</p></section>
  }
  if (phase === 'failed') {
    return (
      <section className="gw-fail">
        <h2>{t('growth.workbench.analyticsFailed')}</h2>
        <p>{error}</p>
        <button type="button" className="gw-button" onClick={onRetry}>{t('growth.workbench.retry')}</button>
      </section>
    )
  }

  const gsc = (analytics?.gsc ?? null) as Record<string, unknown> | null
  const ga4 = (analytics?.ga4 ?? null) as Record<string, unknown> | null
  const gscPages = Array.isArray(gsc?.pages) ? (gsc?.pages as Array<Record<string, unknown>>) : []
  const gscQueries = Array.isArray(gsc?.queries) ? (gsc?.queries as Array<Record<string, unknown>>) : []
  const gscCoverage = (gsc?.coverage ?? {}) as Record<string, unknown>
  const pageDates = gscPages.map((row) => String(row.date || '')).filter(Boolean).sort()
  const gscEnd = typeof gscCoverage.endDate === 'string' ? gscCoverage.endDate : pageDates[pageDates.length - 1]
  const gscStart = gscEnd ? shiftDays(gscEnd, -(days - 1)) : null
  const gscPrevStart = gscStart ? shiftDays(gscStart, -days) : null
  const gscPrevEnd = gscStart ? shiftDays(gscStart, -1) : null
  const inWindow = (date: unknown, start: string | null, end: string | null) =>
    typeof date === 'string' && start !== null && end !== null && date >= start && date <= end

  const aggregate = (rows: Array<Record<string, unknown>>) => {
    let clicks = 0
    let impressions = 0
    let weighted = 0
    let weight = 0
    for (const row of rows) {
      const rowClicks = typeof row.clicks === 'number' ? row.clicks : 0
      const rowImpressions = typeof row.impressions === 'number' ? row.impressions : 0
      clicks += rowClicks
      impressions += rowImpressions
      if (typeof row.position === 'number') {
        weighted += row.position * rowImpressions
        weight += rowImpressions
      }
    }
    return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: weight ? weighted / weight : null }
  }

  const currentPages = gscPages.filter((row) => inWindow(row.date, gscStart, gscEnd))
  const previousPages = gscPages.filter((row) => inWindow(row.date, gscPrevStart, gscPrevEnd))
  const currentQueries = gscQueries.filter((row) => inWindow(row.date, gscStart, gscEnd))
  const gscNow = aggregate(currentPages.length ? currentPages : currentQueries)
  const gscBefore = aggregate(previousPages)

  const queryRows = new Map<string, { clicks: number; impressions: number; weighted: number; weight: number }>()
  for (const row of currentQueries) {
    const query = String(row.query || '')
    if (!query) continue
    const entry = queryRows.get(query) ?? { clicks: 0, impressions: 0, weighted: 0, weight: 0 }
    entry.clicks += typeof row.clicks === 'number' ? row.clicks : 0
    entry.impressions += typeof row.impressions === 'number' ? row.impressions : 0
    if (typeof row.position === 'number') {
      entry.weighted += row.position * (typeof row.impressions === 'number' ? row.impressions : 0)
      entry.weight += typeof row.impressions === 'number' ? row.impressions : 0
    }
    queryRows.set(query, entry)
  }
  const topQueries = [...queryRows.entries()]
    .sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions)
    .slice(0, 8)

  const pageRows = new Map<string, { clicks: number; impressions: number; weighted: number; weight: number }>()
  for (const row of currentPages) {
    const url = String(row.url || '')
    if (!url) continue
    const entry = pageRows.get(url) ?? { clicks: 0, impressions: 0, weighted: 0, weight: 0 }
    entry.clicks += typeof row.clicks === 'number' ? row.clicks : 0
    entry.impressions += typeof row.impressions === 'number' ? row.impressions : 0
    if (typeof row.position === 'number') {
      entry.weighted += row.position * (typeof row.impressions === 'number' ? row.impressions : 0)
      entry.weight += typeof row.impressions === 'number' ? row.impressions : 0
    }
    pageRows.set(url, entry)
  }
  const topPages = [...pageRows.entries()]
    .sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions)
    .slice(0, 8)

  const gscTrend: TrendPoint[] = (gscStart && gscEnd ? daysBetween(gscStart, gscEnd) : []).map((date) => {
    const dayRows = gscPages.filter((row) => String(row.date) === date)
    const other = dayRows.length ? dayRows : gscQueries.filter((row) => String(row.date) === date)
    return {
      date,
      a: other.reduce((total, row) => total + (typeof row.clicks === 'number' ? row.clicks : 0), 0),
      b: other.reduce((total, row) => total + (typeof row.impressions === 'number' ? row.impressions : 0), 0),
    }
  })

  const data = (ga4?.data ?? {}) as Record<string, unknown>
  const history = (data.history ?? ga4?.history ?? {}) as Record<string, unknown>
  const daily = Array.isArray(history.daily) ? (history.daily as Array<Record<string, unknown>>) : []
  const historyCoverage = (history.coverage ?? {}) as Record<string, unknown>
  const dailyDates = daily.map((row) => String(row.date || '')).filter(Boolean).sort()
  const gaEnd = typeof historyCoverage.endDate === 'string' ? historyCoverage.endDate : dailyDates[dailyDates.length - 1]
  const gaStart = gaEnd ? shiftDays(gaEnd, -(days - 1)) : null
  const gaPrevStart = gaStart ? shiftDays(gaStart, -days) : null
  const gaPrevEnd = gaStart ? shiftDays(gaStart, -1) : null
  const gaSum = (start: string | null, end: string | null) => {
    let sessions = 0
    let users = 0
    let views = 0
    let events = 0
    for (const row of daily) {
      if (!inWindow(row.date, start, end)) continue
      sessions += typeof row.sessions === 'number' ? row.sessions : 0
      users += typeof row.activeUsers === 'number' ? row.activeUsers : 0
      views += typeof row.screenPageViews === 'number' ? row.screenPageViews : 0
      events += typeof row.eventCount === 'number' ? row.eventCount : 0
    }
    return { sessions, users, views, events }
  }
  const gaHasHistory = daily.length > 0
  const weekly = (data.current_week ?? {}) as Record<string, unknown>
  const weeklyDelta = (data.delta_pct ?? {}) as Record<string, unknown>
  const weeklyNum = (key: string) => typeof weekly[key] === 'number' ? weekly[key] as number : 0
  const gaNow = gaHasHistory
    ? gaSum(gaStart, gaEnd)
    : { sessions: weeklyNum('sessions'), users: weeklyNum('activeUsers'), views: weeklyNum('screenPageViews'), events: weeklyNum('eventCount') }
  const gaBefore = gaHasHistory ? gaSum(gaPrevStart, gaPrevEnd) : { sessions: 0, users: 0, views: 0, events: 0 }
  const gaDelta = (current: number, previous: number, key: string) => {
    if (gaHasHistory) return delta(current, previous)
    const value = typeof weeklyDelta[key] === 'number' ? weeklyDelta[key] as number : null
    return <small className={value === null ? '' : value > 0 ? 'gw-up' : value < 0 ? 'gw-down' : ''}>{value === null ? '—' : `${value > 0 ? '+' : ''}${value}%`}</small>
  }
  const gaTrend: TrendPoint[] = (gaStart && gaEnd ? daysBetween(gaStart, gaEnd) : []).map((date) => {
    const row = daily.find((item) => String(item.date) === date)
    return {
      date,
      a: typeof row?.sessions === 'number' ? row.sessions : 0,
      b: typeof row?.screenPageViews === 'number' ? row.screenPageViews : 0,
    }
  })
  const channels = Array.isArray(history.channels) ? (history.channels as Array<Record<string, unknown>>) : []
  const devices = Array.isArray(history.devices) ? (history.devices as Array<Record<string, unknown>>) : []
  const countries = Array.isArray(history.countries) ? (history.countries as Array<Record<string, unknown>>) : []
  const events = Array.isArray(history.events) ? (history.events as Array<Record<string, unknown>>) : []
  const gaPages = Array.isArray(history.pages) ? (history.pages as Array<Record<string, unknown>>) : []

  const gscDevices = new Map<string, { clicks: number; impressions: number }>()
  const gscCountries = new Map<string, { clicks: number; impressions: number }>()
  for (const row of currentQueries) {
    const device = String(row.device || '(not set)')
    const country = String(row.country || '(not set)')
    const d = gscDevices.get(device) ?? { clicks: 0, impressions: 0 }
    d.clicks += typeof row.clicks === 'number' ? row.clicks : 0
    d.impressions += typeof row.impressions === 'number' ? row.impressions : 0
    gscDevices.set(device, d)
    const c = gscCountries.get(country) ?? { clicks: 0, impressions: 0 }
    c.clicks += typeof row.clicks === 'number' ? row.clicks : 0
    c.impressions += typeof row.impressions === 'number' ? row.impressions : 0
    gscCountries.set(country, c)
  }
  const top = (map: Map<string, { clicks: number; impressions: number }>) =>
    [...map.entries()].sort((a, b) => b[1].clicks - a[1].clicks || b[1].impressions - a[1].impressions).slice(0, 6)

  const formatDate = (value: string | undefined) => {
    if (!value) return '—'
    const date = new Date(`${value}T00:00:00.000Z`)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(language, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  }
  const formatPct = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`)
  const delta = (current: number, previous: number) => {
    const value = pctChange(current, previous)
    return <small className={value === null ? '' : value > 0 ? 'gw-up' : value < 0 ? 'gw-down' : ''}>{value === null ? '—' : `${value > 0 ? '+' : ''}${value}%`}</small>
  }

  const ask = () => {
    const parts = [
      `Analyse my site's analytics and tell me what to fix first.`,
      `Search Console (${gscStart ?? '—'} → ${gscEnd ?? '—'}): ${gscNow.clicks} clicks, ${gscNow.impressions} impressions, CTR ${formatPct(gscNow.ctr)}, average position ${gscNow.position === null ? '—' : gscNow.position.toFixed(1)}.`,
      `Analytics users (${gaStart ?? '—'} → ${gaEnd ?? '—'}): ${gaNow.sessions} sessions, ${gaNow.users} users, ${gaNow.views} views.`,
    ]
    if (topQueries.length) parts.push(`Top queries: ${topQueries.slice(0, 5).map(([query, row]) => `${query} (${row.clicks} clicks, ${row.impressions} impressions)`).join('; ')}.`)
    parts.push("Explain what changed, what looks anomalous, and turn the highest-value finding into a Growth item with a concrete fix. Read the full Analytics tab before answering.")
    onAsk(parts.join('\n'))
  }

  const kpi = (label: string, value: string, change: ReactNode, hint?: string) => (
    <div className="gw-kpi">
      <span>{label}</span>
      <b>{value}</b>
      {change}
      {hint ? <em>{hint}</em> : null}
    </div>
  )

  return (
    <div className="gw-analytics">
      <header className="gw-an-head">
        <div>
          <p className="gw-eyebrow">{t('growth.workbench.analyticsEyebrow')}</p>
          <h2>{t('growth.workbench.analyticsTitle')}</h2>
          <p className="gw-an-sub">{t('growth.workbench.analyticsSub')}</p>
        </div>
        <div className="gw-an-actions">
          <span className="gw-range" role="group" aria-label={t('growth.workbench.range')}>
            {[7, 28, 90].map((value) => (
              <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>{value}d</button>
            ))}
          </span>
          <button type="button" className="gw-button gw-button-primary" onClick={ask}>
            {t('growth.workbench.askToAnalyse')}
          </button>
        </div>
      </header>

      <section className="gw-kpis" aria-label={t('growth.workbench.analyticsTitle')}>
        {kpi(t('growth.workbench.clicks'), number(gscNow.clicks) ?? '0', delta(gscNow.clicks, gscBefore.clicks), t('growth.workbench.searchConsole'))}
        {kpi(t('growth.workbench.impressions'), number(gscNow.impressions) ?? '0', delta(gscNow.impressions, gscBefore.impressions), t('growth.workbench.searchConsole'))}
        {kpi(t('growth.workbench.ctr'), formatPct(gscNow.ctr), delta(gscNow.ctr, gscBefore.ctr), t('growth.workbench.searchConsole'))}
        {kpi(t('growth.workbench.position'), gscNow.position === null ? '—' : gscNow.position.toFixed(1), <small className={gscBefore.position !== null && gscNow.position !== null && gscNow.position < gscBefore.position ? 'gw-up' : ''}>{gscBefore.position !== null && gscNow.position !== null ? `${gscNow.position <= gscBefore.position ? '' : '+'}${(gscNow.position - gscBefore.position).toFixed(1)}` : '—'}</small>, t('growth.workbench.searchConsole'))}
        {kpi(t('growth.workbench.sessions'), number(gaNow.sessions) ?? '—', gaDelta(gaNow.sessions, gaBefore.sessions, 'sessions'), t('growth.workbench.googleAnalytics'))}
        {kpi(t('growth.workbench.users'), number(gaNow.users) ?? '—', gaDelta(gaNow.users, gaBefore.users, 'activeUsers'), t('growth.workbench.googleAnalytics'))}
        {kpi(t('growth.workbench.views'), number(gaNow.views) ?? '—', gaDelta(gaNow.views, gaBefore.views, 'screenPageViews'), t('growth.workbench.googleAnalytics'))}
        {kpi(t('growth.workbench.events'), number(gaNow.events) ?? '—', gaDelta(gaNow.events, gaBefore.events, 'eventCount'), t('growth.workbench.googleAnalytics'))}
      </section>

      <div className="gw-an-grid">
        <section className="gw-panel gw-panel-wide">
          <header>
            <h3>{t('growth.workbench.searchTrend')}</h3>
            <span className="gw-an-period">{formatDate(gscStart ?? undefined)} → {formatDate(gscEnd ?? undefined)}</span>
          </header>
          <TrendChart
            points={gscTrend}
            labels={[t('growth.workbench.noMeasurementBody')]}
            names={[t('growth.workbench.clicks'), t('growth.workbench.impressions')]}
            colors={['#1f7a68', '#9aa7bd']}
          />
        </section>
        <section className="gw-panel">
          <header>
            <h3>{t('growth.workbench.topQueries')}</h3>
            <span className="gw-an-period">{currentQueries.length ? `${queryRows.size} ${t('growth.workbench.queries')}` : '—'}</span>
          </header>
          {topQueries.length ? (
            <ul className="gw-rank">
              {topQueries.map(([query, row]) => (
                <li key={query}>
                  <span>{query}</span>
                  <b>{number(row.clicks) ?? 0}</b>
                  <small>{number(row.impressions) ?? 0} · {row.weight ? `#${(row.weighted / row.weight).toFixed(1)}` : '—'}</small>
                </li>
              ))}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noQueries')}</p>}
        </section>
      </div>

      <div className="gw-an-grid">
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.topPages')} · {t('growth.workbench.searchConsole')}</h3></header>
          {topPages.length ? (
            <ul className="gw-rank">
              {topPages.map(([url, row]) => (
                <li key={url}><span>{pathLabel(url)}</span><b>{number(row.clicks) ?? 0}</b><small>{number(row.impressions) ?? 0} · {row.weight ? `#${(row.weighted / row.weight).toFixed(1)}` : '—'}</small></li>
              ))}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.devices')} · {t('growth.workbench.searchConsole')}</h3></header>
          {top(gscDevices).length ? (
            <ul className="gw-bars">
              {top(gscDevices).map(([label, row]) => {
                const max = Math.max(...top(gscDevices).map(([, item]) => item.clicks), 1)
                return <li key={label}><span>{label}</span><i style={{ width: `${Math.max(2, (row.clicks / max) * 100)}%` }} /><b>{number(row.clicks) ?? 0}</b></li>
              })}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
      </div>

      <div className="gw-an-grid">
        <section className="gw-panel gw-panel-wide">
          <header>
            <h3>{t('growth.workbench.sessions')} · {t('growth.workbench.views')}</h3>
            <span className="gw-an-period">{formatDate(gaStart ?? undefined)} → {formatDate(gaEnd ?? undefined)}</span>
          </header>
          <TrendChart
            points={gaTrend}
            labels={[t('growth.workbench.noMeasurementBody')]}
            names={[t('growth.workbench.sessions'), t('growth.workbench.views')]}
            colors={['#6b5bd2', '#c9b8f0']}
          />
          <p className="gw-note">{t('growth.workbench.gaHistoryNote')}</p>
        </section>
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.channels')}</h3><span className="gw-an-period">{t('growth.workbench.last90')}</span></header>
          {channels.length ? (
            <ul className="gw-bars">
              {channels.slice(0, 8).map((row) => {
                const max = Math.max(...channels.map((item) => typeof item.sessions === 'number' ? item.sessions : 0), 1)
                const sessions = typeof row.sessions === 'number' ? row.sessions : 0
                return <li key={String(row.channel)}><span>{String(row.channel)}</span><i style={{ width: `${Math.max(2, (sessions / max) * 100)}%` }} /><b>{number(sessions) ?? 0}</b></li>
              })}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
      </div>

      <div className="gw-an-grid gw-an-grid-three">
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.topPages')} · {t('growth.workbench.googleAnalytics')}</h3><span className="gw-an-period">{t('growth.workbench.last90')}</span></header>
          {gaPages.length ? (
            <ul className="gw-rank">
              {gaPages.slice(0, 8).map((row) => (
                <li key={String(row.path)}><span>{pathLabel(String(row.path))}</span><b>{number(row.views) ?? 0}</b><small>{number(row.sessions) ?? 0} {t('growth.workbench.sessions')}</small></li>
              ))}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.devices')}</h3><span className="gw-an-period">{t('growth.workbench.last90')}</span></header>
          {devices.length ? (
            <ul className="gw-bars">
              {devices.slice(0, 5).map((row) => {
                const max = Math.max(...devices.map((item) => typeof item.sessions === 'number' ? item.sessions : 0), 1)
                const sessions = typeof row.sessions === 'number' ? row.sessions : 0
                return <li key={String(row.device)}><span>{String(row.device)}</span><i style={{ width: `${Math.max(2, (sessions / max) * 100)}%` }} /><b>{number(sessions) ?? 0}</b></li>
              })}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.countries')}</h3><span className="gw-an-period">{t('growth.workbench.last90')}</span></header>
          {countries.length ? (
            <ul className="gw-rank">
              {countries.slice(0, 6).map((row) => (
                <li key={String(row.country)}><span>{String(row.country)}</span><b>{number(row.sessions) ?? 0}</b><small>{number(row.users) ?? 0} {t('growth.workbench.users')}</small></li>
              ))}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
      </div>

      <div className="gw-an-grid">
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.events')}</h3><span className="gw-an-period">{t('growth.workbench.last90')}</span></header>
          {events.length ? (
            <ul className="gw-rank">
              {events.slice(0, 10).map((row) => (
                <li key={String(row.event)}><span>{String(row.event)}</span><b>{number(row.count) ?? 0}</b></li>
              ))}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
        <section className="gw-panel">
          <header><h3>{t('growth.workbench.countries')} · {t('growth.workbench.searchConsole')}</h3></header>
          {top(gscCountries).length ? (
            <ul className="gw-rank">
              {top(gscCountries).map(([label, row]) => (
                <li key={label}><span>{label}</span><b>{number(row.clicks) ?? 0}</b><small>{number(row.impressions) ?? 0} {t('growth.workbench.impressions')}</small></li>
              ))}
            </ul>
          ) : <p className="gw-note">{t('growth.workbench.noMeasurement')}</p>}
        </section>
      </div>

      <p className="gw-note gw-an-foot">
        {t('growth.workbench.analyticsNote')}
        {gsc && gsc.status !== 'available' ? ` ${t('growth.workbench.noMeasurement')}.` : ''}
        {ga4 && ga4.status !== 'available' ? ` GA4: ${t('growth.workbench.noMeasurement')}.` : ''}
        {analytics?.reason ? ` ${analytics.reason}` : ''}
      </p>
    </div>
  )
}
