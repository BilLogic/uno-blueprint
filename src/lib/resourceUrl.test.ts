/**
 * A touchpoint icon's address, checked on the way in.
 *
 * Wider than a resource link in two places, both because of where an icon
 * comes from rather than what anyone types: a path on this site is how a
 * deployment seeds its logos, and a loopback http address is what the local
 * stack's storage hands back for an upload. Everything else a link would
 * refuse, this refuses too. `update_touchpoint` holds the same rule, proved
 * in its migration's self-check.
 */
import { describe, expect, it } from 'vitest'
import { ICON_URL_PROBLEM, validateIconUrl } from '@/lib/resourceUrl'

describe('validateIconUrl', () => {
  it.each([
    'https://example.supabase.co/storage/v1/object/public/cell-attachments/touchpoints/a/b.png',
    '/touchpoint-logos/example-logo.png',
    'http://127.0.0.1:54321/storage/v1/object/public/cell-attachments/touchpoints/a/b.png',
    'http://localhost/x.png',
    'http://localhost:3000/x.png',
    'http://[::1]:8080/x.png',
  ])('accepts %s as it stands', (url) => {
    expect(validateIconUrl(url)).toEqual({ ok: true, url })
  })

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'http://cdn.example.com/x.png',
    'http://localhost.example.com/x.png',
    'http://localhost@evil.example/x.png',
    '//evil.example/x.png',
    '/\\evil.example/x.png',
    'cdn.example.com/x.png',
    'https://',
    '/',
  ])('refuses %s', (url) => {
    expect(validateIconUrl(url)).toEqual({ ok: false, problem: ICON_URL_PROBLEM })
  })
})
