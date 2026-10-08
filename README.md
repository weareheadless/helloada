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

Password recovery uses Payload's native `forgot-password` and `reset-password`
operations with Cloudflare Email Service. The `helloada.app` sending domain must
be onboarded in Cloudflare Email Service and the account must use Workers Paid
before a production release; the Worker has a sender-restricted `EMAIL` binding
and sends reset links from `helloada@helloada.app`. The reset token is carried
in the URL fragment so it is not sent in HTTP requests. Do not release or claim
recovery is active until the sending domain is verified and a live delivery test
has succeeded.

## Checks

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run build
PAYLOAD_LOCAL_BUILD=1 PAYLOAD_SECRET=local-build-only-secret-with-32-characters-or-more npx opennextjs-cloudflare build
```

Pull requests and pushes to `main` run these checks in GitHub Actions with the
same Node/npm versions as the VPS release toolchain. CI uses local Cloudflare
bindings and never deploys or reads production secrets.

## Production release

HelloAda and customer Workers are both released by the exact-commit Site-Agent
VPS pipeline. A reviewed HelloAda change must be merged to
`weareheadless/helloada` first. Site-Agent then records its full immutable
commit SHA and a unique release ID in
`deploy/desired-helloada-app-release.json`. The VPS verifies that SHA is on
HelloAda's official `main`, installs the lockfile, runs every CI check, builds
and inspects the OpenNext artifact, uploads one immutable Worker version,
promotes exactly that version, and requires `/api/health` to report the same
SHA. Its protected receipt is stored under
`/SOCIAL/payload-releases/runs/helloada-app/<release-id>/receipt.json`.

Do not use `wrangler deploy` or treat a green CI run as a production release.
The central pipeline injects the owner-handoff private key only during the
HelloAda Worker upload; the key never belongs in Git, a client bundle, or build
environment. See `docs/owner-session-handoff.md` in Site-Agent for key custody
and rotation rules.
