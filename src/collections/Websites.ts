import type { CollectionConfig } from 'payload'

import { isAuthenticated, isWebsiteMember } from './access'

export const Websites: CollectionConfig = {
  slug: 'websites',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'phase', 'workerUrl', 'updatedAt'],
  },
  access: {
    create: isAuthenticated,
    read: isWebsiteMember,
    update: isWebsiteMember,
    delete: isWebsiteMember,
  },
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === 'create' && req.user) {
          return { ...data, owner: req.user.id }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: { readOnly: true },
    },
    {
      name: 'phase',
      type: 'select',
      defaultValue: 'intake',
      options: [
        { label: 'Intake', value: 'intake' },
        { label: 'Designing', value: 'designing' },
        { label: 'Live', value: 'live' },
        { label: 'Needs attention', value: 'needs_attention' },
      ],
    },
    {
      name: 'workerUrl',
      type: 'text',
    },
    {
      name: 'adminUrl',
      type: 'text',
    },
    {
      name: 'domainStatus',
      type: 'select',
      defaultValue: 'not_connected',
      options: [
        { label: 'Not connected', value: 'not_connected' },
        { label: 'Pending', value: 'pending' },
        { label: 'Connected', value: 'connected' },
      ],
    },
    {
      name: 'tenantId',
      type: 'text',
      admin: { readOnly: true },
    },
  ],
}
