import type { PayloadEmailAdapter, SendEmailOptions } from 'payload'

type CloudflareAddress = string | { email: string; name?: string }

export interface CloudflareSendEmailBinding {
  send(message: {
    to: CloudflareAddress | CloudflareAddress[]
    from: CloudflareAddress
    subject: string
    html?: string
    text?: string
  }): Promise<unknown>
}

function normalizeAddresses(value: SendEmailOptions['to']): CloudflareAddress | CloudflareAddress[] {
  const addresses = (Array.isArray(value) ? value : [value]).map((entry) => {
    if (typeof entry === 'string') return entry
    if (!entry || typeof entry.address !== 'string') throw new Error('Email recipient is invalid')
    return entry.name ? { email: entry.address, name: entry.name } : entry.address
  })
  if (addresses.length === 0) throw new Error('Email recipient is required')
  return addresses.length === 1 ? addresses[0] : addresses
}

export function cloudflareEmailAdapter(
  binding: CloudflareSendEmailBinding,
  fromAddress: string,
): PayloadEmailAdapter {
  if (!fromAddress.includes('@')) throw new Error('EMAIL_FROM_ADDRESS must be a valid email address')

  return () => ({
    name: 'cloudflare-email-service',
    defaultFromAddress: fromAddress,
    defaultFromName: 'HelloAda',
    sendEmail: async (message) => {
      if (message.cc || message.bcc || message.attachments?.length) {
        throw new Error('HelloAda transactional email does not support cc, bcc, or attachments')
      }
      if (!message.subject || (!message.text && !message.html)) {
        throw new Error('Email subject and body are required')
      }

      return binding.send({
        to: normalizeAddresses(message.to),
        from: fromAddress,
        subject: message.subject,
        ...(message.text ? { text: message.text } : {}),
        ...(message.html ? { html: message.html } : {}),
      })
    },
  })
}
