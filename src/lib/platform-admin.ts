import type { Where } from 'payload'

type Identity = { id: string | number; email?: string; createdAt?: string; collection?: string }
type Administrator = { id: string; email: string; createdAt: string }

// Deployment-controlled identities, never a role supplied by signup or profile updates.
// Pin creation time as well as ID so a deleted/recreated account cannot inherit access.
export const platformAdministrators: readonly Administrator[] = [
  { id: '8', email: 'admin@helloada.app', createdAt: '2026-10-20T15:14:51.990Z' },
]

export function isPlatformAdmin(user: Identity | null | undefined, administrators = platformAdministrators) {
  return Boolean(user && user.collection === 'users' && administrators.some((admin) =>
    String(user.id) === admin.id && user.email === admin.email && user.createdAt === admin.createdAt,
  ))
}

export function websiteScope(user: Identity): Where {
  return isPlatformAdmin(user) ? {} : { owner: { equals: user.id } }
}

export function userScope(user: Identity): Where {
  return isPlatformAdmin(user) ? {} : { id: { equals: user.id } }
}
