import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bootstrapStepLabels,
  isBootstrapStatus,
  isBootstrapStep,
  bootstrapProgress,
} from '../src/lib/bootstrap-contract.ts'

test('HelloAda accepts only explicit site-agent bootstrap states', () => {
  assert.equal(isBootstrapStep('queueing_shell_release'), true)
  assert.equal(isBootstrapStep('deploying_shell'), true)
  assert.equal(isBootstrapStep('creating_worker_identity'), true)
  assert.equal(bootstrapStepLabels.ready, 'Your Payload admin is ready')
  assert.equal(isBootstrapStatus('awaiting_release'), true)
  assert.equal(isBootstrapStatus('done'), true)
  assert.equal(isBootstrapStep('finished'), false)
  assert.equal(isBootstrapStatus('success'), false)
  assert.equal(isBootstrapStep(undefined), false)
})

test('progress uses persisted steps and the actual failed release stage', () => {
  const steps = Object.fromEntries(['creating_repository', 'creating_data', 'creating_worker_identity', 'creating_worker', 'queueing_shell_release'].map(id => [id, { status: 'done' }]))
  const progress = bootstrapProgress({ status: 'failed', step: 'needs_attention', steps, release: { stage: 'dependencies', status: 'failed' } })
  assert.equal(progress.completed, 5)
  assert.equal(progress.rows.find(row => row.id === 'release-0').status, 'failed')
  assert.equal(progress.rows.find(row => row.id === 'release-1').status, 'pending')
  assert.equal(progress.percent < 100, true)
})

test('unknown and pending states do not fabricate completed milestones', () => {
  assert.equal(bootstrapProgress({}).completed, 0)
  const queued = bootstrapProgress({ step: 'deploying_shell', status: 'awaiting_release' })
  assert.equal(queued.active, 'Waiting for the release runner')
  assert.equal(queued.completed, 0)
})

test('only verified workspace readiness reaches 100 percent', () => {
  assert.equal(bootstrapProgress({ status: 'done' }).percent, 0)
  assert.equal(bootstrapProgress({ status: 'done', workspaceReady: true }).percent, 100)
})
