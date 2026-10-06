export const bootstrapStepLabels = {
  requested: 'Opening your workspace',
  creating_repository: 'Preparing the website',
  creating_data: 'Preparing private website data',
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
