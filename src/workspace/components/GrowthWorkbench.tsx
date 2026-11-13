'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

type Mode = 'opportunities' | 'work' | 'performance'

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
      const response = await fetchHelloAda('/api/helloada/seo/analytics', { cache: 'no-store' })
      if (!response.ok) throw new Error(await failure(response))
      setAnalytics((await response.json()) as Analytics)
      setAnalyticsPhase('ready')
    } catch (exception) {
      setAnalyticsPhase('failed')
      setError((exception as Error)?.message || 'Unknown error')
    }
  }, [])

  useEffect(() => {
    // The workbench opens on its own read; the connector is the only source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    return () => request.current?.abort()
  }, [load])

  useEffect(() => {
    if (mode === 'performance' && analyticsPhase === 'idle') {
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
    } finally {
      setBusy(null)
    }
  }

  const confirm = async (task: ConnectorTask, status: 'in_progress' | 'delivered' | 'verified_outcome') => {
    setBusy(`${task.id}:${status}`)
    setNotice(null)
    try {
      const response = await fetchHelloAda(`/api/helloada/growth/tasks/${encodeURIComponent(task.id)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          opportunityId: task.opportunityId,
          expectedStatus: task.status,
          status,
          idempotencyKey: `ui:${task.id}:${newKey()}`,
          confirmationRef: `ui:task/${task.id}/${newKey()}`,
        }),
      })
      if (!response.ok) throw new Error(await failure(response))
      setNotice(t('growth.workbench.confirmed'))
      await load()
    } catch (exception) {
      setNotice(`${t('growth.workbench.confirmFailed')}: ${(exception as Error)?.message ?? ''}`)
    } finally {
      setBusy(null)
    }
  }

  const groups = useMemo(() => {
    const by = (status: string) => rows.filter((row) => row.status === status)
    const tasks = rows.flatMap((row) => row.tasks.map((task) => ({ task, opportunity: row })))
    return {
      decide: by('detected'),
      parked: by('parked'),
      active: [...by('accepted'), ...by('in_progress')],
      awaiting: tasks.filter(({ task }) => task.status === 'awaiting_human'),
      inFlight: tasks.filter(({ task }) => ['todo', 'in_progress', 'awaiting_human'].includes(task.status)),
      finished: tasks.filter(({ task }) => ['delivered', 'verified_outcome'].includes(task.status)),
      tasks,
    }
  }, [rows])

  const selected = rows.find((row) => row.id === selectedId) ?? null
  const selectedTask = selected ? groups.tasks.find(({ opportunity }) => opportunity.id === selected.id)?.task ?? null : null

  const pipeline = [
    { key: 'decide', label: t('growth.workbench.pipelineDecide'), value: counts?.detected ?? groups.decide.length, hot: true },
    { key: 'parked', label: t('growth.workbench.pipelineParked'), value: counts?.parked ?? groups.parked.length },
    { key: 'progress', label: t('growth.workbench.pipelineInProgress'), value: counts?.in_progress ?? groups.active.length },
    { key: 'awaiting', label: t('growth.workbench.pipelineAwaiting'), value: groups.awaiting.length },
    { key: 'delivered', label: t('growth.workbench.pipelineDelivered'), value: counts?.delivered ?? groups.finished.filter(({ task }) => task.status === 'delivered').length },
    { key: 'verified', label: t('growth.workbench.pipelineVerified'), value: counts?.closed ?? groups.finished.filter(({ task }) => task.status === 'verified_outcome').length },
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
          {t('growth.workbench.modeWork')}<b>{groups.inFlight.length}</b>
        </button>
        <button type="button" aria-pressed={mode === 'performance'} onClick={() => setMode('performance')}>
          {t('growth.workbench.modePerformance')}
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
      ) : mode === 'performance' ? (
        <Performance
          analytics={analytics}
          phase={analyticsPhase}
          error={error}
          onRetry={() => void loadAnalytics()}
          t={t}
          number={number}
        />
      ) : mode === 'work' ? (
        <Work
          tasks={groups.tasks}
          busy={busy}
          confirm={confirm}
          t={t}
          date={date}
          onOpen={(id) => { setSelectedId(id); setMode('opportunities') }}
        />
      ) : (
        <div className="gw-body">
          <aside className="gw-queue" aria-label={t('growth.workbench.queueDecide')}>
            <div className="gw-qhead"><span>{t('growth.workbench.queueDecide')}</span><b>{groups.decide.length}</b></div>
            {groups.decide.length === 0 ? (
              <div className="gw-empty">
                <strong>{t('growth.workbench.emptyQueue')}</strong>
                <p>{t('growth.workbench.emptyQueueBody')}</p>
              </div>
            ) : (
              groups.decide.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={row.id === selectedId ? 'gw-row gw-row-selected' : 'gw-row'}
                  onClick={() => setSelectedId(row.id)}
                  aria-pressed={row.id === selectedId}
                >
                  <span className="gw-row-meta">
                    <span className={`gw-type gw-type-${typeTone(row.dimension)}`}>{typeLabel(row.type)}</span>
                    {typeof row.scoreValue === 'number' ? <span className="gw-score">{row.scoreValue}</span> : null}
                  </span>
                  <strong>{row.title}</strong>
                  <small>
                    {number((row.scoreInputs as { worth?: { volume?: unknown } } | null)?.worth?.volume) ?? '—'}
                    {row.pageUrl ? ` · ${pathLabel(row.pageUrl)}` : ''}
                  </small>
                </button>
              ))
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
                busy={busy}
                decide={decide}
                confirm={confirm}
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

function Detail({
  row,
  task,
  busy,
  decide,
  confirm,
  t,
  date,
  number,
}: {
  row: Opportunity
  task: ConnectorTask | null
  busy: string | null
  decide: (row: Opportunity, operation: 'accept' | 'park' | 'reject') => Promise<void>
  confirm: (task: ConnectorTask, status: 'in_progress' | 'delivered' | 'verified_outcome') => Promise<void>
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
  const decidable = row.status === 'detected' || row.status === 'parked'

  return (
    <article className="gw-article">
      <div className="gw-detail-meta">
        <span className={`gw-type gw-type-${typeTone(row.dimension)}`}>{typeLabel(row.type)}</span>
        <span className={`gw-state gw-state-${row.status}`}>{row.status.replace('_', ' ')}</span>
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
      <p className="gw-note">{t('growth.workbench.priorityNote')}</p>

      {decidable ? (
        <div className="gw-accept">
          <strong>{t('growth.workbench.accept')}</strong>
          <span>{t('growth.workbench.acceptNote')}</span>
          <div className="gw-actions">
            <button
              type="button"
              className="gw-button gw-button-primary"
              disabled={busy !== null}
              onClick={() => void decide(row, 'accept')}
            >
              {busy === `${row.id}:accept` ? t('growth.workbench.deciding') : t('growth.workbench.accept')}
            </button>
            <button type="button" className="gw-button" disabled={busy !== null} onClick={() => void decide(row, 'park')}>
              {t('growth.workbench.park')}
            </button>
            <button type="button" className="gw-button gw-button-quiet" disabled={busy !== null} onClick={() => void decide(row, 'reject')}>
              {t('growth.workbench.reject')}
            </button>
          </div>
        </div>
      ) : null}

      {task ? (
        <div className="gw-accept">
          <strong>{t('growth.workbench.task')}</strong>
          <span>
            {task.status === 'awaiting_human'
              ? t('growth.workbench.taskAwaiting')
              : `${t('growth.workbench.taskAssigned')} ${assigneeLabel(task.assignedTo, t('growth.workbench.owner'))}`}
          </span>
          <div className="gw-actions">
            {task.status === 'todo' ? (
              <button
                type="button"
                className="gw-button gw-button-primary"
                disabled={busy !== null}
                onClick={() => void confirm(task, 'in_progress')}
              >
                {busy === `${task.id}:in_progress` ? t('growth.workbench.starting') : t('growth.workbench.startWork')}
              </button>
            ) : null}
            {task.status === 'awaiting_human' || task.status === 'in_progress' ? (
              <button
                type="button"
                className="gw-button gw-button-primary"
                disabled={busy !== null}
                onClick={() => void confirm(task, 'delivered')}
              >
                {busy === `${task.id}:delivered` ? t('growth.workbench.confirming') : t('growth.workbench.confirmDelivery')}
              </button>
            ) : null}
            {task.status === 'delivered' ? (
              <button
                type="button"
                className="gw-button gw-button-primary"
                disabled={busy !== null}
                onClick={() => void confirm(task, 'verified_outcome')}
              >
                {busy === `${task.id}:verified_outcome` ? t('growth.workbench.confirming') : t('growth.workbench.confirmVerified')}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="gw-timeline">
        <div><b>{t('growth.workbench.detected')}</b><span>{date(row.firstDetectedAt)}</span></div>
        <div><b>{t('growth.workbench.task')}</b><span>{task ? `${task.status.replace('_', ' ')} · ${date(task.updatedAt)}` : t('growth.workbench.noTask')}</span></div>
        {row.decidedAt ? <div><b>{t('growth.workbench.decidedAt')}</b><span>{date(row.decidedAt)}{row.decidedBy ? ` · ${row.decidedBy}` : ''}</span></div> : null}
      </div>
    </article>
  )
}

function Work({
  tasks,
  busy,
  confirm,
  t,
  date,
  onOpen,
}: {
  tasks: Array<{ task: ConnectorTask; opportunity: Opportunity }>
  busy: string | null
  confirm: (task: ConnectorTask, status: 'in_progress' | 'delivered' | 'verified_outcome') => Promise<void>
  t: Copy
  date: (value: string | null | undefined) => string
  onOpen: (opportunityId: string) => void
}) {
  const [showDone, setShowDone] = useState(false)
  const open = tasks.filter(({ task }) => ['todo', 'in_progress', 'awaiting_human'].includes(task.status))
  const done = tasks.filter(({ task }) => ['delivered', 'verified_outcome'].includes(task.status))

  if (tasks.length === 0) {
    return (
      <section className="gw-fail">
        <h2>{t('growth.workbench.workEmpty')}</h2>
        <p>{t('growth.workbench.workEmptyBody')}</p>
      </section>
    )
  }

  const row = ({ task, opportunity }: { task: ConnectorTask; opportunity: Opportunity }) => (
    <article className="gw-task" key={task.id}>
      <div className="gw-detail-meta">
        <span className={`gw-state gw-state-${task.status}`}>{t(`growth.workbench.status${task.status === 'verified_outcome' ? 'Verified' : task.status === 'awaiting_human' ? 'Awaiting' : task.status === 'in_progress' ? 'InProgress' : task.status === 'delivered' ? 'Delivered' : 'Todo'}`)}</span>
        <span className="gw-seen">{date(task.updatedAt)}</span>
      </div>
      <h3>{task.title}</h3>
      <p className="gw-summary">{t('growth.workbench.taskFor')} <button type="button" className="gw-link" onClick={() => onOpen(opportunity.id)}>{opportunity.title}</button></p>
      <div className="gw-actions">
        {task.status === 'todo' ? (
          <button type="button" className="gw-button gw-button-primary" disabled={busy !== null} onClick={() => void confirm(task, 'in_progress')}>
            {busy === `${task.id}:in_progress` ? t('growth.workbench.starting') : t('growth.workbench.startWork')}
          </button>
        ) : null}
        {task.status === 'awaiting_human' || task.status === 'in_progress' ? (
          <button type="button" className="gw-button gw-button-primary" disabled={busy !== null} onClick={() => void confirm(task, 'delivered')}>
            {busy === `${task.id}:delivered` ? t('growth.workbench.confirming') : t('growth.workbench.confirmDelivery')}
          </button>
        ) : null}
        {task.status === 'delivered' ? (
          <button type="button" className="gw-button" disabled={busy !== null} onClick={() => void confirm(task, 'verified_outcome')}>
            {busy === `${task.id}:verified_outcome` ? t('growth.workbench.confirming') : t('growth.workbench.confirmVerified')}
          </button>
        ) : null}
      </div>
    </article>
  )

  return (
    <section className="gw-work">
      {open.map(row)}
      {done.length ? (
        <>
          <div className="gw-divider"><span>{t('growth.workbench.pipelineDelivered')}</span><b>{done.length}</b></div>
          {(showDone ? done : done.slice(0, 5)).map(row)}
          {done.length > 5 ? (
            <button type="button" className="gw-more" onClick={() => setShowDone((value) => !value)}>
              {showDone ? t('growth.workbench.showLess') : t('growth.workbench.showMore')}
            </button>
          ) : null}
        </>
      ) : null}
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

function Performance({
  analytics,
  phase,
  error,
  onRetry,
  t,
  number,
}: {
  analytics: Analytics | null
  phase: 'idle' | 'loading' | 'ready' | 'failed'
  error: string | null
  onRetry: () => void
  t: Copy
  number: (value: unknown) => string | null
}) {
  if (phase === 'loading' || phase === 'idle') {
    return <section className="gw-fail"><p>{t('growth.workbench.loading')}</p></section>
  }
  if (phase === 'failed') {
    return (
      <section className="gw-fail">
        <h2>{t('growth.workbench.performanceFailed')}</h2>
        <p>{error}</p>
        <button type="button" className="gw-button" onClick={onRetry}>{t('growth.workbench.retry')}</button>
      </section>
    )
  }

  const ga4 = analytics?.ga4 ?? null
  const gsc = analytics?.gsc ?? null
  const period = analytics?.requestedPeriod
  const fallbackCoverage = period?.startDate && period?.endDate ? `${period.startDate} → ${period.endDate}` : null

  const header = (label: string, data: Record<string, unknown> | null) => {
    const connection = (data?.connection ?? {}) as Record<string, unknown>
    const status = connection.status
    return (
      <header>
        <h3>{label}</h3>
        <span className={status === 'connected' ? 'gw-chip' : 'gw-chip gw-chip-warn'}>
          <i />{connectionLabel(status, t)}
        </span>
      </header>
    )
  }

  const missing = (label: string, data: Record<string, unknown> | null) => (
    <section className="gw-panel">
      {header(label, data)}
      <p className="gw-note">
        {t('growth.workbench.noMeasurement')} — {t('growth.workbench.noMeasurementBody')}
        {data && typeof data.reason === 'string' ? ` (${data.reason})` : ''}
      </p>
      {!data && analytics?.reason ? <p className="gw-note gw-note-warn">{analytics.reason}</p> : null}
    </section>
  )

  const gscPanel = (() => {
    const data = gsc
    if (!data || data.status !== 'available') return missing(t('growth.workbench.performanceGsc'), data)
    const pages = data.pages
    const clicks = sum(pages, 'clicks')
    const impressions = sum(pages, 'impressions')
    const ctr = impressions > 0 ? clicks / impressions : null
    const rowsWithPosition = Array.isArray(pages) ? pages.filter((row) => typeof (row as Record<string, unknown>)?.position === 'number') : []
    const weighted = rowsWithPosition.reduce((total, row) => {
      const entry = row as Record<string, number>
      return total + entry.position * (entry.impressions || 0)
    }, 0)
    const weight = rowsWithPosition.reduce((total, row) => total + ((row as Record<string, number>).impressions || 0), 0)
    const position = weight > 0 ? weighted / weight : null
    const coverage = (data.coverage ?? {}) as Record<string, unknown>
    const coverageLabel = coverage.startDate && coverage.endDate ? `${coverage.startDate} → ${coverage.endDate}` : fallbackCoverage
    const queries = Array.isArray(data.queries) ? (data.queries as Array<Record<string, unknown>>) : []
    return (
      <section className="gw-panel">
        {header(t('growth.workbench.performanceGsc'), data)}
        <dl className="gw-stats">
          <div><dt>{t('growth.workbench.clicks')}</dt><dd>{number(clicks) ?? '0'}</dd></div>
          <div><dt>{t('growth.workbench.impressions')}</dt><dd>{number(impressions) ?? '0'}</dd></div>
          <div><dt>{t('growth.workbench.ctr')}</dt><dd>{ctr === null ? '—' : `${(ctr * 100).toFixed(1)}%`}</dd></div>
          <div><dt>{t('growth.workbench.position')}</dt><dd>{position === null ? '—' : position.toFixed(1)}</dd></div>
          {coverageLabel ? <div><dt>{t('growth.workbench.coverage')}</dt><dd>{coverageLabel}</dd></div> : null}
        </dl>
        {queries.length ? (
          <ul className="gw-list">
            {queries.slice(0, 6).map((row, index) => (
              <li key={`${row.query}-${index}`}><span>{String(row.query)}</span><b>{number(row.clicks) ?? ''}</b></li>
            ))}
          </ul>
        ) : null}
        {(data.connection as Record<string, unknown> | undefined)?.status === 'ambiguous'
          ? <p className="gw-note gw-note-warn">{t('growth.workbench.ambiguousNote')}</p> : null}
      </section>
    )
  })()

  const ga4Panel = (() => {
    const data = ga4
    if (!data || data.status !== 'available') return missing(t('growth.workbench.performanceGa4'), data)
    const metrics = (data.data ?? {}) as Record<string, unknown>
    const current = (metrics.current_week ?? {}) as Record<string, unknown>
    const delta = (metrics.delta_pct ?? {}) as Record<string, unknown>
    const topPages = Array.isArray(metrics.top_pages) ? (metrics.top_pages as Array<Record<string, unknown>>) : []
    const coverage = (data.coverage ?? {}) as Record<string, unknown>
    const coverageLabel = coverage.startDate && coverage.endDate ? `${coverage.startDate} → ${coverage.endDate}` : fallbackCoverage
    const latest = (data.latestSync ?? {}) as Record<string, unknown>
    return (
      <section className="gw-panel">
        {header(t('growth.workbench.performanceGa4'), data)}
        <dl className="gw-stats">
          <div><dt>{t('growth.workbench.users')}</dt><dd>{number(current.activeUsers) ?? '—'}{typeof delta.activeUsers === 'number' ? <small>{delta.activeUsers > 0 ? '+' : ''}{delta.activeUsers}%</small> : null}</dd></div>
          <div><dt>{t('growth.workbench.sessions')}</dt><dd>{number(current.sessions) ?? '—'}{typeof delta.sessions === 'number' ? <small>{delta.sessions > 0 ? '+' : ''}{delta.sessions}%</small> : null}</dd></div>
          {coverageLabel ? <div><dt>{t('growth.workbench.coverage')}</dt><dd>{coverageLabel}</dd></div> : null}
          {latest.status ? <div><dt>{t('growth.workbench.latestSync')}</dt><dd>{String(latest.status)}</dd></div> : null}
        </dl>
        {topPages.length ? (
          <ul className="gw-list">
            {topPages.slice(0, 6).map((page, index) => (
              <li key={`${page.path}-${index}`}><span>{pathLabel(String(page.path))}</span><b>{number(page.views) ?? ''}</b></li>
            ))}
          </ul>
        ) : null}
        {(data.connection as Record<string, unknown> | undefined)?.status === 'ambiguous'
          ? <p className="gw-note gw-note-warn">{t('growth.workbench.ambiguousNote')}</p> : null}
      </section>
    )
  })()

  return <div className="gw-performance">{gscPanel}{ga4Panel}</div>
}
