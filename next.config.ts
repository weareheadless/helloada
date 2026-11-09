import type { NextConfig } from 'next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { withPayload } from '@payloadcms/next/withPayload'

initOpenNextCloudflareForDev()

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    cpus: 1,
  },
  serverExternalPackages: ['jose', 'pg-cloudflare'],
  // The mailbox UI ships TypeScript source generated from the pinned upstream.
  transpilePackages: ['@weareheadless/helloada-mailbox-ui'],
  // Tenant media is served from the tenant origin, not this app.
  images: { unoptimized: true },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
