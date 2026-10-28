import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { isPlatformAdmin, platformAdministrators, userScope } from '../lib/platform-admin.ts'

export const Users: CollectionConfig = {
  slug: 'users',
  // An owner works through intake and design over hours; a two-hour absolute
  // expiry logs them out mid-task. Payload refreshes the token on activity, so a
  // long absolute lifetime plus a matching cookie is what keeps a working
  // session alive without weakening anything else.
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30,
    cookies: { sameSite: 'Lax', secure: true },
  },
  access: {
    create: () => true,
    read: ({ req }) => req.user ? userScope(req.user) : false,
    update: ({ req }) => req.user ? { id: { equals: req.user.id } } : false,
    delete: ({ req }) => req.user && !isPlatformAdmin(req.user) ? { id: { equals: req.user.id } } : false,
  },
  admin: {
    useAsTitle: 'email',
  },
  hooks: {
    beforeChange: [({ data, operation, originalDoc }) => {
      const reserved = platformAdministrators.some((admin) => admin.email === String(data.email || '').trim().toLowerCase())
      if (reserved && (operation === 'create' || !isPlatformAdmin({ ...originalDoc, collection: 'users' }))) {
        throw new APIError('This account address is reserved.', 403)
      }
      return data
    }],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
  ],
}
