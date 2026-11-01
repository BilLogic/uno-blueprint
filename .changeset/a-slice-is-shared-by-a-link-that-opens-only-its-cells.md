---
"uno-blueprint": patch
---

A slice may cite cells from more than one service, and someone who may confirm can share it as a link with `share_slice`. The link opens the slice and the cells it cites, read live, for anyone holding it, and nothing else; `unshare_slice` stops it.

**Upgrading a deployment:** run `supabase db push` to apply `21000326000000_a_slice_may_cross_services_and_be_shared_by_a_link.sql`, then redeploy the `uno-tools` function. Every blueprint table still has public reads, so a link is not the only way into a deployment's blueprint until that deployment revokes the anonymous role's table reads.
