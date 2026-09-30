import type { CollectionConfig } from 'payload'

import { deny, isRelatedWebsiteMember } from './access'

export const Revisions: CollectionConfig = {
  slug: 'revisions',
  access: {
    create: deny,
    read: isRelatedWebsiteMember,
    update: deny,
    delete: deny,
  },
  fields: [
    { name: 'website', type: 'relationship', relationTo: 'websites', required: true },
    { name: 'operation', type: 'relationship', relationTo: 'operations' },
    { name: 'summary', type: 'text', required: true },
    { name: 'sourceIdentity', type: 'text' },
    { name: 'workerUrl', type: 'text' },
    { name: 'rollbackOf', type: 'relationship', relationTo: 'revisions' },
  ],
}
