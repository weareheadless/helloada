/**
 * Type boundary for the generated mailbox package.
 *
 * The package ships TypeScript source generated from a third-party app that
 * compiles with `noImplicitAny: false`. The control plane does not weaken its
 * own compiler settings for vendor code, so the small surface this app uses is
 * declared here and the package validates itself with its own contract tests.
 */
declare module '@weareheadless/helloada-mailbox-ui' {
  import type { ReactNode } from 'react'

  export type MailboxConfig = { apiBase: string; basePath: string }

  export function MailboxApp(props: {
    config: MailboxConfig
    path: string
    params?: Record<string, string>
    locale?: string
  }): ReactNode

  export const mailboxRoutes: ReadonlyArray<{ pattern: string; element: ReactNode }>
}
