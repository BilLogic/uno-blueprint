---
'uno-blueprint': patch
---

The agent's slice write tools refuse malformed or unknown cell ids before they write. `create_slice` and `replace_slides` now check every cell id first. An id that is not in the 8-4-4-4-12 hex form is refused without asking the database. A well-formed id must name a cell under the active service. The refusal names each bad id and tells the model to copy ids verbatim from `get_slice` or `list_blueprint`. Before this, a seeded id copied with zeros dropped reached Postgres, which refused the uuid cast in the middle of a write that had already partly landed. `replace_slides` now needs an active service, as `create_slice` already did, and `replace_slides` and `update_slice` refuse a slice that is not the active service's before they write, pointing the model at `list_slices`. The eval harness's rehearsal client now answers the cell existence check — a select from `cells` that names its rows by `in('id', …)` — with those rows, so a rehearsed slice write still finds its cells.

Upgrading a deployment: nothing to do.
