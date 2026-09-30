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
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
