# HelloAda

The central HelloAda account and multi-website control-plane shell.

This app intentionally uses Payload's existing authentication model and keeps
customer website records isolated by owner. A website creation records the
durable bootstrap job and asks the shared site-agent control plane to register
and asynchronously bootstrap an isolated Next/React/Payload tenant. The room
displays durable progress, hands the owner into the managed workspace once the
Worker is healthy, confirms the intake brief, requests a read-only direction,
and approves the next owner recommendation.

## Local development

```bash
npm install
npm run dev
```

For a local Payload/D1 session, provide the same Cloudflare bindings and
`PAYLOAD_SECRET` used by the target Worker. Never put production credentials in
this repository. Server-side control-plane calls additionally use
`SITE_AGENT_URL` (the host only; `/v1` is normalized) and
`HELLOADA_CONTROL_PLANE_TOKEN`.

Local builds use Wrangler's local bindings by default. Set
`CLOUDFLARE_REMOTE_BINDINGS=1` only when you intentionally need a remote
Cloudflare binding and have authenticated Wrangler with a short-lived local
environment credential.

## Checks

```bash
npm run typecheck
npm run build
```

The central app is not the full WebsiteWorkspace. It owns the portfolio,
intake/build room, bootstrap progress, and handoff entry; the existing customer
workspace remains the full admin surface.
