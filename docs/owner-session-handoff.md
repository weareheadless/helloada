# Owner session handoff

HelloAda is the authenticated multi-site selector. A selected tenant opens its own
Payload admin through a one-use owner-session grant; a direct admin link is not
an authentication path.

## Runtime secrets

The HelloAda Worker requires `HELLOADA_HANDOFF_PRIVATE_KEY`: one
base64url-encoded DER PKCS#8 RSA private key. Site-Agent's protected API
environment requires `HELLOADA_HANDOFF_PUBLIC_KEY`: the matching base64url-
encoded DER SPKI public key. The canonical tenant template pins the issuer to
`https://helloada.app` and bootstrap copies only the public key into each
tenant Worker's runtime variables. Never place either key in Git, a client
bundle, a tenant repository, or a URL.

The private key is held on the Site-Agent VPS at
`/SOCIAL/configs/helloada-app/secrets.json`, owned by the release account with
mode `0600`. The central release pipeline reads that file only for the exact
HelloAda Worker upload and passes it to Wrangler through a short-lived
mode-`0600` secrets file; the value is not supplied to dependency installation,
tests, lint, typecheck, or build. The matching public key is held in
`/SOCIAL/configs/site-agent-api/.env` and is loaded by the API service. Neither
value is printed in deployment output or stored in Git.

Generate the pair once on the protected VPS using the documented secure
operator procedure. Do not use an interactive command that writes the private
value to shell history, process arguments, CI logs, or chat output. New-site
bootstrap fails closed before provisioning if the public key is missing or
malformed. HelloAda's production release fails closed if the private key is
missing, insecurely permissioned, malformed, or does not match the API public
key.

## Request contract

The owner-entry endpoint checks account membership, then verifies Site-Agent's
ready-state and exact Worker receipt before issuing a grant. The grant is RS256,
valid for 60 seconds, and binds the stable HelloAda account subject, one tenant,
the exact Worker origin and the `payload-admin-session` purpose. The browser
submits it by a top-level POST; it is never put in a URL or persistent browser
storage.

The tenant Worker validates the issuer signature, claims and browser Origin,
then atomically consumes the grant ID in its own Payload D1. It finds or creates
the hidden Payload user by the stable HelloAda subject—never by email—and sets
Payload's ordinary secure session cookie. Local password login and anonymous
first-user registration remain disabled. A failed exchange needs a newly issued
grant; do not add a direct-admin, shared-service-token or local-password
fallback.

Rotate the pair only as a coordinated operation: write the new private and
public values to their protected VPS locations, then release the API with the
new public key and HelloAda with the matching private key through the canonical
Site-Agent pipeline. New tenant bootstrap uses the public key loaded by the
current API. Existing tenant Workers must receive the new public binding through
an explicit Site-Agent release before old-key retirement; until every affected
tenant is updated, handoff is unavailable for that tenant.

## Intelligence project handoff (UI-017 / UI-004)

When an authenticated owner creates a website, HelloAda derives the tenant and
intelligence project identity from the authenticated Payload owner ID and the
owner-scoped `Idempotency-Key` UUID. The display name is only a label. Reusing
the same key with a different name keeps the same identity and returns the
existing `idempotency_conflict`; it must not silently create another project.
An ownership transfer or move to a future organization requires an explicit
migration and must not silently change this identity.

HelloAda sends this optional JSON metadata to Site-Agent's trusted
`POST /v1/control-plane/websites/{tenantId}/register` call, alongside
`display_name`:

```json
{
  "external_organization_id": "helloada:<authenticated-owner-user-id>",
  "owner_subject": "<authenticated-owner-user-id>",
  "origin": { "system": "helloada", "external_id": "<tenant-id>" },
  "external_project_id": "helloada:<tenant-id>"
}
```

The values are constructed server-side; request-body owner identity is never
trusted. UI-004's Site-Agent producer should persist these as the stable
organization, origin, and project identity and return them in an optional
`intelligence_identity` object using the same snake-case field names. The
optional producer acknowledgement is paired with
`intelligence_registration: { "status": "registered", "workspace_id":
"<server-workspace-id>", "project_id": "<server-project-id>",
"external_organization_id": "helloada:<owner-id>", "origin": { "system":
"helloada", "external_id": "<tenant-id>" }, "external_project_id":
"helloada:<tenant-id>" }`. `registered`
means the intelligence project is registered; it does not assert research, site,
knowledge, or workspace readiness. An exact identity echo without this receipt
is acknowledgement only and remains pending. Older Site-Agent versions may
omit either optional response field; a missing registration receipt stays
pending. A supplied identity echo or registration receipt with a wrong scope,
missing server ID, or unsupported status fails closed. HelloAda persists only
the whitelisted identity envelope and nonsecret workspace/project IDs, never
arbitrary producer response fields. Once received, canonical IDs must remain
stable on retries. A repeated create request with the same key and name is the
explicit retry path and reuses the same tenant/project. Neither a matching
registration receipt nor workspace bootstrap readiness means intelligence is
ready; a later workflow must verify that state. Do not put provider credentials,
issuer keys, or control-plane tokens in this request metadata, browser payloads,
or persisted receipts.
