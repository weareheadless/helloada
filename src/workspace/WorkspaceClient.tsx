'use client'

import { Suspense } from 'react'

import { WebsiteWorkspace } from '@/workspace/components/WebsiteWorkspace'
import { HelloAdaSiteProvider } from '@/workspace/config/provider'
import type { HelloAdaSiteConfig } from '@/workspace/config/site'

export function WorkspaceClient({ config, slug }: { config: HelloAdaSiteConfig; slug: string }) {
  return (
    <HelloAdaSiteProvider config={config}>
      <Suspense fallback={null}>
        <WebsiteWorkspace slug={slug} />
      </Suspense>
    </HelloAdaSiteProvider>
  )
}
