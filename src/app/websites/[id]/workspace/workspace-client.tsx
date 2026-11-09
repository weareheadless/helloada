'use client'

import { Suspense } from 'react'

import { WebsiteWorkspace } from '@/workspace/components/WebsiteWorkspace'
import { HelloAdaSiteProvider } from '@/workspace/config/provider'
import type { HelloAdaSiteConfig } from '@/workspace/config/site'

export function WorkspaceClient({ config }: { config: HelloAdaSiteConfig }) {
  return (
    <HelloAdaSiteProvider config={config}>
      <Suspense fallback={null}>
        <WebsiteWorkspace />
      </Suspense>
    </HelloAdaSiteProvider>
  )
}
