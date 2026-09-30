import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sqliteD1Adapter } from '@payloadcms/db-d1-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { r2Storage } from '@payloadcms/storage-r2'
import { translations } from '@payloadcms/translations/all'
import type { GetPlatformProxyOptions } from 'wrangler'
import { buildConfig } from 'payload'

import { BootstrapJobs } from './collections/BootstrapJobs'
import { Operations } from './collections/Operations'
import { Revisions } from './collections/Revisions'
import { Users } from './collections/Users'
import { Websites } from './collections/Websites'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const realpath = (value: string) => {
  try {
    return fs.existsSync(value) ? fs.realpathSync(value) : undefined
  } catch {
    return undefined
  }
}

const isCLI = process.env.PAYLOAD_CLI === '1' || process.argv.some((value) => {
  const resolved = realpath(value)
  return Boolean(resolved && (resolved.endsWith(path.join('payload', 'bin.js')) || resolved.endsWith(path.join('next', 'dist', 'bin', 'next'))))
})
const isProduction = process.env.NODE_ENV === 'production'
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'
const isLocalBuild = process.env.PAYLOAD_LOCAL_BUILD === '1'

export const cloudflare =
  isCLI || !isProduction || isLocalBuild || isNextBuild
    ? await getCloudflareContextFromWrangler()
    : await getCloudflareContext({ async: true })

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — HelloAda',
      applicationName: 'HelloAda',
      description: 'A calm control room for shaping your websites with Ada.',
    },
  },
  collections: [Users, Websites, BootstrapJobs, Operations, Revisions],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || (isProduction ? '' : 'helloada-local-development-secret'),
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  i18n: { fallbackLanguage: 'en', supportedLanguages: translations },
  db: sqliteD1Adapter({ binding: cloudflare.env.D1 }),
  plugins: [
    r2Storage({
      bucket: cloudflare.env.R2,
      collections: {},
    }),
  ],
})

async function getCloudflareContextFromWrangler() {
  return import(/* webpackIgnore: true */ `${'__wrangler'.replaceAll('_', '')}`).then(
    ({ getPlatformProxy }) => getPlatformProxy({
      environment: process.env.CLOUDFLARE_ENV,
      remoteBindings: process.env.CLOUDFLARE_REMOTE_BINDINGS === '1',
    } satisfies GetPlatformProxyOptions),
  )
}
