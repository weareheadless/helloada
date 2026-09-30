import type { CollectionConfig } from 'payload'

import { deny, isRelatedWebsiteMember } from './access'

export const BootstrapJobs: CollectionConfig = {
  slug: 'bootstrap-jobs',
  access: {
    create: isRelatedWebsiteMember,
    read: isRelatedWebsiteMember,
    update: isRelatedWebsiteMember,
    delete: deny,
  },
  fields: [
    {
      name: 'website',
      type: 'relationship',
      relationTo: 'websites',
      required: true,
    },
    {
      name: 'step',
      type: 'select',
      defaultValue: 'requested',
      options: [
        { label: 'Requested', value: 'requested' },
        { label: 'Creating repository', value: 'creating_repository' },
        { label: 'Creating Worker', value: 'creating_worker' },
        { label: 'Creating data', value: 'creating_data' },
        { label: 'Deploying shell', value: 'deploying_shell' },
        { label: 'Ready', value: 'ready' },
        { label: 'Needs attention', value: 'needs_attention' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'queued',
      options: [
        { label: 'Queued', value: 'queued' },
        { label: 'Running', value: 'running' },
        { label: 'Done', value: 'done' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      name: 'retries',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'resourceReceipts',
      type: 'json',
    },
    {
      name: 'diagnostic',
      type: 'textarea',
    },
  ],
}
