import test from 'node:test'
import assert from 'node:assert/strict'

import { cloudflareEmailAdapter } from '../src/lib/cloudflare-email.ts'

test('Cloudflare email adapter sends only the requested transactional fields', async () => {
  const sent = []
  const adapter = cloudflareEmailAdapter({
    send: async (message) => {
      sent.push(message)
      return { messageId: 'mail-1' }
    },
  }, 'helloada@helloada.app')({ payload: {} })

  await adapter.sendEmail({
    to: { name: 'Ada Owner', address: 'owner@example.com' },
    from: 'ignored@example.com',
    subject: 'Reset your password',
    html: '<a href="https://helloada.app/reset-password#token=one-time">Reset</a>',
    text: 'Reset your password using the one-time link.',
  })

  assert.deepEqual(sent, [{
    to: { email: 'owner@example.com', name: 'Ada Owner' },
    from: 'helloada@helloada.app',
    subject: 'Reset your password',
    html: '<a href="https://helloada.app/reset-password#token=one-time">Reset</a>',
    text: 'Reset your password using the one-time link.',
  }])
})

test('Cloudflare email adapter rejects unsupported attachments and missing bodies', async () => {
  const adapter = cloudflareEmailAdapter({ send: async () => ({ messageId: 'mail-1' }) }, 'helloada@helloada.app')({ payload: {} })

  await assert.rejects(
    adapter.sendEmail({ to: 'owner@example.com', subject: 'Reset', attachments: [{ filename: 'x' }] }),
    /does not support cc, bcc, or attachments/,
  )
  await assert.rejects(
    adapter.sendEmail({ to: 'owner@example.com', subject: 'Reset' }),
    /Email subject and body are required/,
  )
})

test('Cloudflare email adapter rejects invalid sender and recipient configuration', async () => {
  assert.throws(() => cloudflareEmailAdapter({ send: async () => ({}) }, 'not-an-address'), /EMAIL_FROM_ADDRESS/)

  const adapter = cloudflareEmailAdapter({ send: async () => ({}) }, 'helloada@helloada.app')({ payload: {} })
  await assert.rejects(
    adapter.sendEmail({ to: { name: 'No address' }, subject: 'Reset', text: 'Reset' }),
    /Email recipient is invalid/,
  )
})
