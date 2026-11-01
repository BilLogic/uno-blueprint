---
summary: A slice is shared as a link whose token is read by one security-definer function returning only the slice and the cells it cites; the token is stored as a hash, revocable, and not a table policy, because the template's public read policies would make a token-keyed policy narrow nothing.
---

# 36. A share link reads through one function

**Status** Accepted — 2026-11-01.
**Context** `supabase/migrations/21000325000000_a_slice_may_cross_services_and_be_shared_by_a_link.sql`,
the **Share link** entry in [`GLOSSARY.md`](../../GLOSSARY.md),
[0032](0032-the-owner-agent-stays-in-the-template-for-v0.md)

## Decision

A slice may cite cells from any service of the business; its `service_id` is
the service it is filed under. Someone who may confirm shares it with
`share_slice`, which returns a link once. The link carries a 64-character
token (two `gen_random_uuid()` values, 244 random bits); `slice_shares` keeps
only its SHA-256, and no blueprint table keeps the token. The reply that hands
the link over stays in the sharer's own transcript. Anyone holding the link opens it on the tool server at
`…/uno-tools/shared/<token>`, with no account. The tool server calls
`read_shared_slice(p_token)` as the anonymous role, and that function returns
the slice's own fields and each slide's cited cells, read at call time, with
their lane, step, scenario and service names. A revoked, unknown or malformed
token is refused with one sentence. `unshare_slice` revokes every link to a
slice; deleting the slice deletes its links. No request role may read
`slice_shares`, and the change log records a share without its token.

## Context

The spec asked for a link whose reads row-level security limits to the cells
the slice cites. Every blueprint table in this template carries a public
`SELECT` policy (`SECURITY.md`). Postgres combines a table's permissive
policies with OR, so a policy that admits the cells a token names would add
nothing to what the anonymous role already reads. A token-keyed policy also
needs the token on every request, which PostgREST can only offer through a
request header the policy parses.

## Consequences

The link opens exactly what the function returns, and its proofs hold that at
the database (the migration's own fixture, `scripts/tests/slice-shares.sql`)
and over MCP (`src/lib/agent/server/shares.postgrest.test.ts`): the cell beside
a cited one, and the uncited cells of either service, are absent.

On a deployment that keeps the template's public reads, the link is not the
only way to read the blueprint: the anonymous key reads every table directly.
A business whose blueprint must stay private revokes the anonymous role's
table reads; links keep working unchanged, because they never used them.
Choosing that posture for a deployment is a separate decision.

Revoking is per slice: `unshare_slice` stops every link to it, and there is
no way to stop one link and keep another. Someone who may not confirm can
only propose an unshare, so a link handed to the wrong reader stays open until
someone who may confirm approves. The token sits in the URL path, so the
hosted functions' request logs record it; that is why a link is revoked
rather than trusted to stay secret.

The page a link opens is plain text (or JSON with `?format=json`) served by
the tool server, since the hosted functions domain does not serve HTML. A
richer reader, such as the canvas presenter opening a token, can read the
same function later.
