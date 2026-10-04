/**
 * Cache lifetime for uploaded storage objects: a year, in seconds. Upload
 * keys are minted per upload and never overwritten, so a cached copy can
 * never go stale.
 */
export const UPLOAD_CACHE_CONTROL = '31536000'
