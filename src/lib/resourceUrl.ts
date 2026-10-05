/**
 * Resource URLs, validated on the way in.
 *
 * Stricter than the render-side `safeExternalHref`, deliberately. That one
 * accepts `http:` because it guards *existing* data it did not choose, and
 * blanking a link someone already relies on is worse than rendering it. This
 * one guards new data, where there is no reason to accept plaintext.
 *
 * Both exist because "validated on write" and "validated on render" answer
 * different questions: whether to store it, and whether to trust what was
 * stored. Neither substitutes for the other — anything can reach the table
 * through the map skill or a seed.
 */

/** Schemes that may be stored. Anything else is refused, not coerced. */
const ALLOWED_PROTOCOL = 'https:'

export type ResourceUrlResult =
  | { ok: true; url: string }
  | { ok: false; problem: string }

/**
 * Normalise and check one resource URL.
 *
 * A bare `figma.com/file/…` is upgraded to `https://` rather than rejected —
 * typing the scheme is not something anyone should have to remember, and the
 * upgrade is unambiguous. `http://` is *not* upgraded: silently changing what
 * someone explicitly typed would hide that the link they have is insecure.
 */
export function validateResourceUrl(raw: string): ResourceUrlResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, problem: 'A resource needs a link.' }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`

  let parsed: URL
  try {
    parsed = new URL(candidate)
  } catch {
    return { ok: false, problem: `“${trimmed}” is not a link.` }
  }

  if (parsed.protocol !== ALLOWED_PROTOCOL) {
    return {
      ok: false,
      problem:
        parsed.protocol === 'http:'
          ? 'Use an https link — this one is http, which is not secure.'
          : `Links must start with https — “${parsed.protocol}” is not allowed.`,
    }
  }

  return { ok: true, url: parsed.toString() }
}

/** True when the URL is safe to store. Convenience for disabling a control. */
export function isStorableResourceUrl(raw: string): boolean {
  return validateResourceUrl(raw).ok
}

/** Why an icon address is refused — one sentence, whatever was wrong with it. */
export const ICON_URL_PROBLEM =
  'An icon has to be an https address or a path on this site.'

/** Hosts whose http is the developer's own machine, never the network. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Check one touchpoint icon address, kept exactly as it came.
 *
 * The resource rule with two widenings, each owed to where an icon comes
 * from. A path on this site (`/touchpoint-logos/…`, never `//…`, which a
 * browser reads as another host) is how a deployment seeds its logos, and the
 * renderer resolves it under the base path. An http address on a loopback
 * host is what the local stack's storage hands back for an upload, so
 * refusing it would refuse every icon uploaded in development; on any other
 * host http is refused as a link would be. Nothing is upgraded or rewritten:
 * an icon is uploaded or seeded, not typed, so there is no typing to forgive.
 *
 * Empty is the caller's business — it is how an icon is cleared — so it is
 * not this function's question. `update_touchpoint` holds the same rule.
 */
export function validateIconUrl(raw: string): ResourceUrlResult {
  const url = raw.trim()
  const refused = { ok: false, problem: ICON_URL_PROBLEM } as const
  if (/\s/.test(url)) return refused
  if (/^\/[^/\\]/.test(url)) return { ok: true, url }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return refused
  }
  // The slashes are checked as written as well as parsed: the parser reads
  // `https:cdn.example.com/x.png` as an address, and the function this rule
  // mirrors does not.
  if (!/^https?:\/\//i.test(url) || !parsed.hostname) return refused
  if (parsed.protocol === 'https:') return { ok: true, url }
  if (parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)) {
    return { ok: true, url }
  }
  return refused
}
