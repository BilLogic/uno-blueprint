/**
 * Every key in the shared query cache, built in one place.
 *
 * A read hook builds its key here, and a write invalidates the key it
 * affects from here, so the two cannot spell the same cache differently — a
 * key a read builds and no write invalidates is a screen that lies until a
 * reload (`staleTime: Infinity`), and a key a write invalidates and no read
 * builds is a line that does nothing. Both had happened: `cell-content:` and
 * `cell-spec:` were invalidated at eight sites after their reader had moved
 * off the cache.
 *
 * Keys are single strings, matched by PREFIX on invalidation. A family is a
 * prefix and the keys under it: `slice.of(id)` is one slice's key, and
 * `slice.prefix` invalidates every slice. The structural set — what a
 * phase, scenario, path, step, lane or cell write can change — is a product
 * of the same families.
 */

type Family = {
  /** Every key of the family starts with this — the argument to invalidate them all. */
  readonly prefix: string
  /** One member's key. */
  of(id: string): string
}

function family(name: string): Family {
  return { prefix: `${name}:`, of: (id) => `${name}:${id}` }
}

export const queryKeys = {
  // Whole-deployment reads: one key each.
  activeService: 'active-service',
  laneSources: 'lane-sources',
  archiveAvailable: 'archive-available',
  stakeholders: 'stakeholders',
  ownerTags: 'owner-tags',
  valueAudiences: 'value-audiences',
  touchpointRegistryTones: 'touchpoint-registry-tones',

  // Per-service reads, keyed by the resolved active service's id. A read
  // with no id builds no key and fetches nothing.
  servicePhases: family('service-phases'),
  slices: family('slices'),
  serviceEntityExamples: family('service-entity-examples'),
  /** The service's spec row, read under two keys: the public one and the privileged one. */
  serviceSpec: {
    prefix: 'service-spec:',
    of: (serviceId: string, privateRead: boolean) =>
      privateRead ? `service-spec:${serviceId}:private` : `service-spec:${serviceId}`,
  },

  // Per-row reads.
  slice: family('slice'),
  scenarioPaths: family('scenario-paths'),
  phaseSpec: family('phase-spec'),
  scenarioSpec: family('scenario-spec'),
  laneSpec: family('lane-spec'),
  stepSpec: family('step-spec'),
  evidence: family('evidence'),
  registryTouchpoints: family('registry-touchpoints'),
  /** One registry entry whole, with how many placements it has. */
  touchpointEntry: family('touchpoint-entry'),
  nameOnlyPlacements: family('name-only-placements'),
  cellDeepLink: family('cell-deep-link'),
  /** A slice's scenario, keyed by the cells it cites. */
  sliceScenario: {
    prefix: 'slice-scenario:',
    of: (cellIds: readonly string[]) => `slice-scenario:${[...cellIds].sort().join('|')}`,
  },

  /**
   * The canvas, one query per scenario. `prefix` covers every scenario;
   * `of(scenarioId)` is one. A write that knows only a path or a cell
   * narrows through the predicates in `queryClient.ts`, which read the
   * cached rows.
   */
  canvasBlueprints: {
    prefix: 'canvas-blueprints:',
    of: (scenarioId: string) => `canvas-blueprints:scenario:${scenarioId}`,
  },
} as const

/**
 * Every cache a structural write can change — phases, scenarios, paths,
 * lanes, cells, arrows, slices — as prefixes.
 *
 * One list rather than a hand-rolled subset at each mutation site. The
 * subsets had already drifted five ways: the delete dialog cleared six keys,
 * the rename and create-version paths four, the duplicate menu three, and
 * the session sheet's revert two — so reverting a `duplicate_path` left a
 * ghost row in the paths catalog whose id 404s, and `staleTime: Infinity`
 * means a missed key stays stale until a reload rather than until the next
 * refetch.
 *
 * Over-invalidating is a refetch of data that is already correct; missing a
 * key is a screen that lies. Prefix matches are no-ops for the kinds they do
 * not apply to, so the whole set is cheap enough to always send.
 */
export const STRUCTURE_KEYS: readonly string[] = [
  queryKeys.servicePhases.prefix,
  queryKeys.canvasBlueprints.prefix,
  queryKeys.scenarioPaths.prefix,
  queryKeys.laneSources,
  queryKeys.slices.prefix,
  // A slice's own detail is keyed separately, and a cascade can empty it.
  queryKeys.slice.prefix,
]

/**
 * Every prefix a key can start with, for the guard that no key is spelled
 * outside this module.
 */
export const KEY_PREFIXES: readonly string[] = Object.values(queryKeys).map((entry) =>
  typeof entry === 'string' ? entry : entry.prefix,
)
