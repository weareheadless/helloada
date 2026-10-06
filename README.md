# HelloAda

The authenticated multi-website portfolio and project selector.

Owners choose an existing website or explicitly create a new one. Creating a
website registers one canonical site-agent tenant and starts its Payload
workspace bootstrap. Once the exact tenant admin is ready, HelloAda uses a
short-lived, single-use owner-session handoff. Intake, Ada, content, design,
growth and review then live in that tenant's Payload admin. A ready admin shell
is not a launched public website.

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
npm ci
npm test
npm run lint
npm run typecheck
npm run build
PAYLOAD_LOCAL_BUILD=1 PAYLOAD_SECRET=local-build-only-secret-with-32-characters-or-more npx opennextjs-cloudflare build
```

Pull requests and pushes to `main` run these checks in GitHub Actions. CI uses
local Cloudflare bindings and never deploys or reads production secrets. The
customer Worker release remains a separate, exact-commit request through the
site-agent VPS queue; HelloAda's own production release must use its explicitly
configured Cloudflare release path and must not be inferred from a passing CI
run.
