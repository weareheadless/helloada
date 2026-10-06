import test from 'node:test'
import assert from 'node:assert/strict'

import {
  bootstrapStepLabels,
  isBootstrapStatus,
  isBootstrapStep,
} from '../src/lib/bootstrap-contract.ts'

test('HelloAda accepts only explicit site-agent bootstrap states', () => {
  assert.equal(isBootstrapStep('queueing_shell_release'), true)
  assert.equal(isBootstrapStep('deploying_shell'), true)
  assert.equal(bootstrapStepLabels.ready, 'Your Payload admin is ready')
  assert.equal(isBootstrapStatus('awaiting_release'), true)
  assert.equal(isBootstrapStatus('done'), true)
  assert.equal(isBootstrapStep('finished'), false)
  assert.equal(isBootstrapStatus('success'), false)
  assert.equal(isBootstrapStep(undefined), false)
})
