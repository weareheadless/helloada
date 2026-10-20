import type { Payload, PayloadRequest, TypedUser, Where } from 'payload'
import { websiteScope } from './platform-admin.ts'

const removedPrefix = 'helloada.portfolio.removed.'
type PortfolioAuth = { payload: Payload; req: Partial<PayloadRequest>; user: TypedUser }

function ownerPreferences(auth: PortfolioAuth): Where[] {
  return [
    { 'user.value': { equals: auth.user.id } },
    { 'user.relationTo': { equals: auth.user.collection } },
  ]
}

// Portfolio visibility is an owner preference, independent of tenant lifecycle.
// Keep the website and its related history intact so removal is reversible.
export async function removedWebsiteIds(auth: PortfolioAuth) {
  const preferences = await auth.payload.find({
    collection: 'payload-preferences',
    req: auth.req,
    overrideAccess: false,
    where: { and: [...ownerPreferences(auth), { key: { contains: removedPrefix } }] },
    pagination: false,
    depth: 0,
  })
  return new Set(preferences.docs.flatMap(({ key }) => {
    if (!key?.startsWith(removedPrefix)) return []
    const id = key.slice(removedPrefix.length)
    return /^\d+$/.test(id) ? [id] : []
  }))
}

export async function setWebsiteRemoved(auth: PortfolioAuth, websiteId: number, removed: boolean) {
  // Local API access checks must be explicit: Payload otherwise overrides them.
  const website = await auth.payload.find({
    collection: 'websites',
    req: auth.req,
    overrideAccess: false,
    where: { and: [{ id: { equals: websiteId } }, websiteScope(auth.user)] },
    limit: 1,
    depth: 0,
  })
  if (!website.docs.length) return false

  const key = removedPrefix + websiteId
  const where: Where = { and: [...ownerPreferences(auth), { key: { equals: key } }] }
  if (!removed) {
    await auth.payload.delete({ collection: 'payload-preferences', req: auth.req, overrideAccess: false, where })
    return true
  }
  const existing = await auth.payload.find({
    collection: 'payload-preferences', req: auth.req, overrideAccess: false, where, limit: 1, depth: 0,
  })
  if (!existing.docs.length) {
    await auth.payload.create({
      collection: 'payload-preferences', req: auth.req, overrideAccess: false,
      data: { key, value: true, user: { relationTo: auth.user.collection, value: auth.user.id } },
    })
  }
  return true
}
