# Owner session handoff

HelloAda is the authenticated multi-site selector. A selected tenant opens its own
Payload admin through a one-use owner-session grant; a direct admin link is not
an authentication path.

## Runtime secrets

The HelloAda server runtime must have `HELLOADA_HANDOFF_PRIVATE_KEY`: one
base64url-encoded DER PKCS#8 RSA private key. Site-Agent's protected VPS service
environment must have `HELLOADA_HANDOFF_PUBLIC_KEY`: the matching base64url-
encoded DER SPKI public key. The canonical tenant template pins the issuer to
`https://helloada.app` and bootstrap copies only the public key into each
tenant Worker's runtime variables. Never place either key in Git, a client
bundle, a tenant repository, or a URL.

Generate the pair once using an approved secure key-management process. Store
the private key only in the HelloAda hosting provider's server-side secret
store; store the public key only in the Site-Agent VPS environment. Do not use
an interactive command that writes the private value to shell history or CI
logs. New-site bootstrap fails closed before provisioning if the public key is
missing or malformed.

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

Rotate the pair only as a coordinated operation: update the HelloAda private
secret and Site-Agent public secret together, then release the new public
binding to every registered tenant through the canonical Site-Agent deployment
pipeline. Until all tenants use the matching public key, handoff is unavailable.
