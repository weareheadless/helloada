# Agent instructions

Read `docs/agent-coordination.md` for UI/OPS implementation work. Claim one Ready
issue with the actual run ID, branch, baseline, reviewed contract and bounded
paths. Use an early draft PR, report actual tests and stop for manager review.
Scope changes require replanning. Do not merge or deploy. Preserve HelloAda's
existing tenant/bootstrap/owner-handoff boundaries; reuse the shared key and
Project rather than adding a separate bot-management system.

On this shared coding host, load `GITHUB_PROJECTS_TOKEN` from
`/SOCIAL/configs/github.env` as `GH_TOKEN`; do not print or commit the key.
The existing key includes repository and Projects access. The canonical loading
commands and bootstrap instructions are in
https://github.com/weareheadless/crawlseo/blob/main/docs/architecture/centralized-intelligence/agent-workflow.md.
