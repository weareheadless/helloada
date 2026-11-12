/**
 * Where the compiled candidate is mounted for owner review.
 *
 * The build takes its Next `basePath` from the tenant identity, so every
 * starter (Ada's chat job, a design job, a browser retry) compiles the one
 * artifact this workspace frames. Both the in-app frame and a full-screen tab
 * request that URL, which is served by the workspace's own owner-authenticated
 * route. There is no second surface and no tenant handoff.
 */
export const sourcePreviewMount = (tenantId: string): string => {
  const tenant = String(tenantId || '').trim()
  // Same identity rule the preview service applies to the mount it builds.
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/.test(tenant)) return ''
  return `/api/helloada/tenants/${tenant}/source/preview`
}

/**
 * The exact job mount, or nothing when the job identity is not a safe path.
 * No trailing slash: that is the canonical document URL Next serves for its
 * basePath, so the frame's first request is the page itself, not a redirect.
 */
export const sourcePreviewUrl = (mount: string, jobId: string): string | undefined => {
  const base = String(mount || '').trim().replace(/\/+$/, '')
  const id = String(jobId || '').trim()
  if (!base || !/^[A-Za-z0-9._:-]{1,120}$/.test(id)) return undefined
  return `${base}/${id}/runtime`
}
