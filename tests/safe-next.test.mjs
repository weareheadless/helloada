import assert from 'node:assert/strict'
import test from 'node:test'

import { safeNextPath } from '../src/lib/safe-next.ts'

test('the handoff destination stays on the control-plane origin', () => {
  assert.equal(safeNextPath('/mail/inbox'), '/mail/inbox')
  assert.equal(safeNextPath('/mail/inbox?folder=starred'), '/mail/inbox?folder=starred')
  assert.equal(safeNextPath(undefined), '/admin')
  assert.equal(safeNextPath(''), '/admin')
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'mail/inbox', 'javascript:alert(1)']) {
    assert.throws(() => safeNextPath(value), /next_path_invalid/)
  }
})
