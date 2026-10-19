/** The consent page is an arrival route, including its trailing-slash form. */
export function isConsentRoute(pathname: string, basePath = import.meta.env.BASE_URL): boolean {
  return pathname.replace(/\/$/, '') === `${basePath}oauth/consent`
}
