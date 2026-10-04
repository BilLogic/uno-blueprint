/**
 * The base path — the one module that owns where under its host the app is
 * served.
 *
 * By default the app is served from the root of a domain, and every path the
 * browser shows is a path the app can read as it stands. A host may mount it
 * under a prefix instead (`https://host/demo/…`), and then the browser's path
 * and the app's path differ by that prefix. Everything that reads a pathname,
 * writes one, or hands the browser a stored image path crosses between the two
 * here. The two writers that only replace the SEARCH (`BoardAddressSync`, the
 * view-state writer) keep `location.pathname` as it stands, prefix included,
 * and so need no crossing.
 *
 * The prefix is a BUILD-time setting: `BASE_PATH` in the build environment,
 * which `vite.config.ts` hands to Vite as `base`, and which reaches this
 * module as `import.meta.env.BASE_URL`. It is not a `DeploymentConfig` field
 * because a config is read when `App` renders, and the prefix is already baked
 * into every asset URL the build emitted by then. Unset, it is `/`, and every
 * function below is the identity — a deployment served from a root builds and
 * behaves exactly as it did before the setting existed.
 *
 * Each function takes the base as a trailing argument, defaulting to the
 * build's own, so the crossings can be pinned under a prefix without a build.
 */

/** The build's base: `/`, or `/<prefix>/`. Vite has already normalised it. */
const BUILD_BASE: string = import.meta.env.BASE_URL || '/'

/**
 * A base-path setting, as `/` or `/<segments>/`.
 *
 * Shared in spirit with `vite.config.ts`, which cannot import from the
 * application (it is bundled in isolation) and states the same rule inline.
 * A value that is not a path — a full URL, a relative `./`, anything with a
 * query or a fragment — is refused rather than guessed at: a base that is
 * silently wrong is an app whose every asset 404s.
 */
export function normalizeBasePath(value: string | undefined): string {
  const trimmed = (value ?? '').trim()
  if (!trimmed) return '/'
  // A `.` or `..` segment anywhere is refused too: a prefix that climbs names
  // a folder outside the build, and the build clears the folders it names.
  const climbs = trimmed.split('/').some((segment) => segment === '.' || segment === '..')
  if (
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('.') ||
    climbs ||
    /[?#]/.test(trimmed)
  ) {
    throw new Error(
      `BASE_PATH must be a path such as /demo/, not ${JSON.stringify(value)}`,
    )
  }
  const segments = trimmed.split('/').filter(Boolean)
  return segments.length === 0 ? '/' : `/${segments.join('/')}/`
}

/**
 * The browser's pathname with the prefix taken off — the path the app routes
 * on. `/demo/field-service` under `/demo/` is `/field-service`, and the bare
 * prefix (with or without its trailing slash) is `/`. A path outside the
 * prefix is returned as it stands: there is nothing to strip, and inventing a
 * route out of it would be worse than reading it plainly.
 */
export function toAppPath(pathname: string, base: string = BUILD_BASE): string {
  if (base === '/') return pathname
  const bare = base.slice(0, -1)
  if (pathname === bare) return '/'
  if (!pathname.startsWith(base)) return pathname
  return `/${pathname.slice(base.length)}`
}

/**
 * An app path — a pathname, optionally with its search — under the prefix: the
 * path to write into the address bar. `/field-service?cell=a` under `/demo/`
 * is `/demo/field-service?cell=a`.
 */
export function toServedPath(appPath: string, base: string = BUILD_BASE): string {
  if (base === '/') return appPath
  return `${base}${appPath.replace(/^\/+/, '')}`
}

/**
 * A stored image path as the browser has to ask for it.
 *
 * A frame, a touchpoint logo or a cover image is a string in a row or in a
 * deployment's content, and a root-relative one (`/cover/ub-map.svg`) names a
 * file in the served `public/` directory — which, under a prefix, is served
 * from under the prefix too. So a single leading slash is prefixed, and every
 * other URL is left exactly as written: an absolute or protocol-relative URL
 * names somebody else's host, `data:` and `blob:` name no path at all, and a
 * path already inside the prefix is already right.
 */
export function servedUrl(url: string, base: string = BUILD_BASE): string {
  if (base === '/') return url
  if (!url.startsWith('/') || url.startsWith('//')) return url
  if (url.startsWith(base)) return url
  return toServedPath(url, base)
}

/**
 * The app's own root as an absolute URL — where a mailed sign-in link sends
 * its reader. At the root it is the bare origin, exactly the value it was
 * before a prefix could be set, so an existing redirect allow-list keeps
 * matching; under a prefix it is the origin and the prefix.
 */
export function appRootUrl(origin: string, base: string = BUILD_BASE): string {
  return base === '/' ? origin : `${origin}${base}`
}
