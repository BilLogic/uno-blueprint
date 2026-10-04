import { describe, expect, it } from 'vitest'
import {
  appRootUrl,
  normalizeBasePath,
  servedUrl,
  toAppPath,
  toServedPath,
} from '@/lib/basePath'

/*
 * The app is served from a base path — `/` by default, `/demo/` or any other
 * prefix when a host mounts it under one. These pin the four crossings between
 * the path the browser shows and the path the app reasons about, at the root
 * and under a prefix, so a deep link, a written address and a stored image
 * path all land inside the prefix.
 */

describe('normalizeBasePath', () => {
  it('is the root when nothing is set', () => {
    expect(normalizeBasePath(undefined)).toBe('/')
    expect(normalizeBasePath('')).toBe('/')
    expect(normalizeBasePath('   ')).toBe('/')
    expect(normalizeBasePath('/')).toBe('/')
  })

  it('always starts and ends with one slash', () => {
    expect(normalizeBasePath('demo')).toBe('/demo/')
    expect(normalizeBasePath('/demo')).toBe('/demo/')
    expect(normalizeBasePath('demo/')).toBe('/demo/')
    expect(normalizeBasePath('//demo//')).toBe('/demo/')
    expect(normalizeBasePath('/a/b')).toBe('/a/b/')
  })

  // The same table as scripts/tests/base-path-rule.test.mjs, which holds the
  // build's and the hosting check's copies of this rule to it.
  it('refuses a value that is not a path', () => {
    expect(() => normalizeBasePath('https://example.com/demo/')).toThrow(/path/)
    expect(() => normalizeBasePath('./demo')).toThrow(/path/)
    expect(() => normalizeBasePath('/demo?x=1')).toThrow(/path/)
    expect(() => normalizeBasePath('../demo')).toThrow(/path/)
    expect(() => normalizeBasePath('/demo#top')).toThrow(/path/)
    expect(() => normalizeBasePath('/../x/')).toThrow(/path/)
    expect(() => normalizeBasePath('/a/../b/')).toThrow(/path/)
    expect(() => normalizeBasePath('/./x/')).toThrow(/path/)
    expect(() => normalizeBasePath('/a/..')).toThrow(/path/)
  })
})

describe('toAppPath — the browser path, with the prefix taken off', () => {
  it('is the identity at the root', () => {
    expect(toAppPath('/', '/')).toBe('/')
    expect(toAppPath('/field-service', '/')).toBe('/field-service')
  })

  it('strips the prefix under a base', () => {
    expect(toAppPath('/demo/', '/demo/')).toBe('/')
    expect(toAppPath('/demo', '/demo/')).toBe('/')
    expect(toAppPath('/demo/field-service', '/demo/')).toBe('/field-service')
  })

  it('leaves a path outside the base alone rather than inventing one', () => {
    expect(toAppPath('/elsewhere', '/demo/')).toBe('/elsewhere')
    // A segment that merely STARTS with the base's letters is not inside it.
    expect(toAppPath('/demonstration', '/demo/')).toBe('/demonstration')
  })
})

describe('toServedPath — an app path, under the prefix', () => {
  it('is the identity at the root', () => {
    expect(toServedPath('/', '/')).toBe('/')
    expect(toServedPath('/field-service?cell=a', '/')).toBe('/field-service?cell=a')
  })

  it('prefixes under a base', () => {
    expect(toServedPath('/', '/demo/')).toBe('/demo/')
    expect(toServedPath('/?cell=a', '/demo/')).toBe('/demo/?cell=a')
    expect(toServedPath('/field-service?cell=a', '/demo/')).toBe('/demo/field-service?cell=a')
  })

  it('round-trips with toAppPath', () => {
    for (const path of ['/', '/field-service', '/a/b']) {
      expect(toAppPath(toServedPath(path, '/demo/'), '/demo/')).toBe(path)
    }
  })
})

describe('servedUrl — a stored image path, as the browser must ask for it', () => {
  it('is the identity at the root', () => {
    expect(servedUrl('/cover/ub-map.svg', '/')).toBe('/cover/ub-map.svg')
  })

  it('prefixes a root-relative path under a base', () => {
    expect(servedUrl('/cover/ub-map.svg', '/demo/')).toBe('/demo/cover/ub-map.svg')
  })

  it('leaves every other kind of URL alone', () => {
    for (const url of [
      'https://cdn.example.com/a.png',
      '//cdn.example.com/a.png',
      'data:image/svg+xml;base64,AAAA',
      'blob:https://host/123',
      'relative/a.png',
      '',
    ]) {
      expect(servedUrl(url, '/demo/')).toBe(url)
    }
  })

  it('does not prefix a path already inside the base', () => {
    expect(servedUrl('/demo/cover/ub-map.svg', '/demo/')).toBe('/demo/cover/ub-map.svg')
  })
})

describe('appRootUrl — where a mailed sign-in link lands', () => {
  it('is the bare origin at the root, as it always was', () => {
    expect(appRootUrl('https://host.example', '/')).toBe('https://host.example')
  })

  it('carries the prefix under a base', () => {
    expect(appRootUrl('https://host.example', '/demo/')).toBe('https://host.example/demo/')
  })
})
