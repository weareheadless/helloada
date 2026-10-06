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
