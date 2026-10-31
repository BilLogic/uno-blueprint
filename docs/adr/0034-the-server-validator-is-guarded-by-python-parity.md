---
summary: The server uses a TypeScript validator because its runtime cannot execute Python; parity against the canonical file validator gates changes to the port.
---

# 34. The server validator is guarded by Python parity

**Status** Accepted — 2026-10-22.

## Decision

The tool server uses a TypeScript port of the canonical file validator. Its
Edge runtime cannot execute Python, and installing the application must not
require a separate interpreter or a remote validation service. The Python
validator remains the authority for the document contract.

The generated schema supplies shape rules. Parity compares verdicts, error
counts and error paths against Python over mutated documents and documents
projected from scratch database fixtures. Messages may use different wording.
The database projection translates stored `frame` to the file validator's
historical `picture` field; it does not reject a stored frame as an unknown
field.

## Consequences

Two implementations cost maintenance. When `scripts/validate_ir.py` changes,
extend the parity corpus for the changed rule, update the port, prove parity,
and then refresh the source fingerprint. Schema changes regenerate the bundled
rules through `npm run sync:skills`; CI checks freshness separately.

Replacing Python's contract with what the TypeScript schema happens to accept
would be a tempting simplification, but would silently change existing imports.
Removing parity or updating only the fingerprint would lose the independent
proof that makes this port acceptable.
