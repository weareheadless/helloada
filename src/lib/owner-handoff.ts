const encoder = new TextEncoder()

const base64Url = (bytes: Uint8Array) => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodePrivateKey(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length < 300 || value.length > 4096) {
    throw new Error('HELLOADA_HANDOFF_PRIVATE_KEY is missing or invalid')
  }
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4)
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

export async function issueOwnerHandoff(input: {
  tenantId: string
  ownerSubject: string
  targetOrigin: string
  nowSeconds?: number
}) {
  const encodedKey = String(process.env.HELLOADA_HANDOFF_PRIVATE_KEY || '').trim()
  if (!encodedKey) throw new Error('Owner handoff signing is not configured')
  const origin = new URL(input.targetOrigin)
  if (origin.protocol !== 'https:' || origin.origin !== input.targetOrigin) {
    throw new Error('Owner handoff target origin is invalid')
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const claims = {
    iss: 'https://helloada.app',
    aud: input.tenantId,
    sub: input.ownerSubject,
    jti: crypto.randomUUID(),
    purpose: 'payload-admin-session',
    target_origin: origin.origin,
    iat: now,
    exp: now + 60,
  }
  const encodedHeader = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const encodedClaims = base64Url(encoder.encode(JSON.stringify(claims)))
  const signingInput = `${encodedHeader}.${encodedClaims}`
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    decodePrivateKey(encodedKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, encoder.encode(signingInput))
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}
