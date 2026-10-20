import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { isPlatformAdmin, platformAdministrators, userScope } from '../lib/platform-admin.ts'

export const Users: CollectionConfig = {
  slug: 'users',
  auth: true,
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
