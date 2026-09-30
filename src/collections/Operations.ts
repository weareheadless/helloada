import type { CollectionConfig } from 'payload'

import { deny, isRelatedWebsiteMember } from './access'

export const Operations: CollectionConfig = {
  slug: 'operations',
  access: {
    create: deny,
    read: isRelatedWebsiteMember,
    update: deny,
    delete: deny,
  },
  fields: [
    { name: 'website', type: 'relationship', relationTo: 'websites', required: true },
    { name: 'tool', type: 'text', required: true },
    { name: 'origin', type: 'select', options: ['owner_message', 'recommendation'], required: true },
    { name: 'status', type: 'select', options: ['queued', 'running', 'done', 'failed', 'cancelled'], required: true },
    { name: 'inputHash', type: 'text', required: true },
    { name: 'sourceActionId', type: 'text' },
    { name: 'reason', type: 'text' },
    { name: 'outcome', type: 'json' },
  ],
}
