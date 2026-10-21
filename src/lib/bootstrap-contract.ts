export const bootstrapStepLabels = {
  requested: 'Opening your workspace',
  creating_repository: 'Preparing the website',
  creating_data: 'Preparing private website data',
  creating_worker_identity: 'Reserving your workspace address',
  creating_worker: 'Connecting the website services',
  queueing_shell_release: 'Making the Payload admin ready',
  deploying_shell: 'Making the Payload admin ready',
  ready: 'Your Payload admin is ready',
  needs_attention: 'Workspace needs attention',
} as const

export type BootstrapStep = keyof typeof bootstrapStepLabels

export const bootstrapStatuses = ['queued', 'running', 'awaiting_release', 'done', 'failed'] as const
export type BootstrapStatus = typeof bootstrapStatuses[number]

export function isBootstrapStep(value: unknown): value is BootstrapStep {
  return typeof value === 'string' && Object.hasOwn(bootstrapStepLabels, value)
}

export function isBootstrapStatus(value: unknown): value is BootstrapStatus {
  return typeof value === 'string' && (bootstrapStatuses as readonly string[]).includes(value)
}

export type BootstrapState = {
  status?: string; step?: string; label?: string; workspaceReady?: boolean; diagnostic?: string
  steps?: Record<string, { status?: string }>
  release?: { id?: string; status?: string; stage?: string; updated_at?: string }
}

const setupSteps = [
  ['creating_repository', 'Prepare your website project'],
  ['creating_data', 'Create private storage'],
  ['creating_worker_identity', 'Reserve your workspace address'],
  ['creating_worker', 'Connect your website services'],
  ['queueing_shell_release', 'Queue the workspace release'],
] as const

const releaseGroups = [
  { label: 'Check the shared website system', stages: ['preflight', 'credentials', 'checkout', 'shared-runtime-overlay', 'dependencies'] },
  { label: 'Build your admin workspace', stages: ['build', 'artifact-verified'] },
  { label: 'Prepare your database and inbox', stages: ['provision-mailflare-resources', 'migrate-mailflare-schema', 'provision-turnstile', 'initialize-schema', 'migrate-schema', 'verify-workspace-bootstrap-contract', 'verify-payload-contract'] },
  { label: 'Deploy your workspace', stages: ['deploy-durable-object-lifecycle', 'upload', 'promote'] },
  { label: 'Connect background services', stages: ['reconcile-cron-triggers', 'reconcile-queue-consumers'] },
  { label: 'Verify access and connections', stages: ['verify-deployment', 'verify-cron-triggers', 'verify-queue-consumers', 'verify-mailflare-migrations', 'enable-workers-dev', 'verify-connection', 'trigger-email-provisioning', 'awaiting-browser-verification', 'verified'] },
] as const

export function bootstrapProgress(state: BootstrapState) {
  const ready = state.workspaceReady === true
  const failed = state.status === 'failed'
  const group = releaseGroups.findIndex(item => (item.stages as readonly string[]).includes(state.release?.stage || ''))
  const rows: Array<{ id: string; label: string; status: 'done' | 'running' | 'failed' | 'pending' }> = setupSteps.map(([id, label]) => ({
    id, label, status: ready ? 'done'
      : state.steps?.[id]?.status === 'done' ? 'done'
      : state.steps?.[id]?.status === 'failed' ? 'failed'
      : state.step === id || state.steps?.[id]?.status === 'running' ? 'running' : 'pending',
  }))
  for (const [index, item] of releaseGroups.entries()) {
    rows.push({ id: 'release-' + index, label: item.label,
      status: ready ? 'done' : index < group ? 'done' : index === group ? (failed ? 'failed' : 'running') : 'pending' })
  }
  rows.push({ id: 'ready', label: 'Open your workspace with Ada', status: ready ? 'done' : 'pending' })
  const completed = rows.filter(row => row.status === 'done').length
  return { rows, completed, total: rows.length, percent: Math.round(100 * completed / rows.length),
    active: rows.find(row => row.status === 'failed' || row.status === 'running')?.label
      || (state.step === 'deploying_shell' ? 'Waiting for the release runner' : state.label || bootstrapStepLabels.requested) }
}
