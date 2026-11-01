/**
 * Which shapes this template speaks, as TypeScript carries the list.
 *
 * The adapter contract has always required "a compatible `schema_version`".
 * Until the database grew a `schema_version` table the value lived only in an
 * IR file and in `blueprint-workspace.json`, so the compatibility check
 * compared a file against a file and never once asked the target. An IR
 * authored against a schema the database does not have would import
 * cheerfully and fail on the first column that moved.
 *
 * The list below is the whole compatibility rule: a version is supported or it
 * is not. Ranges were the alternative and are a promise nobody can keep —
 * "2026.07.16 and later" claims compatibility with shapes that do not exist
 * yet. Each entry earns its place by having a migration behind it.
 *
 * **Nothing at runtime asks this module.** The check against a live target is
 * `npm run check:target` (`scripts/check-target-schema.mjs`), which reads the
 * same list out of `references/ir-schema.json` — the one source, which
 * `scripts/validate_ir.py` reads too. This list is the TypeScript half of that
 * agreement, and `schemaVersion.test.ts` is what holds the two halves equal:
 * the enum, the version this checkout builds, and the version the bootstrap
 * migration seeds. A second copy of a version list is a second thing to
 * forget, so the copy carries the test that will not let it drift.
 */

/** The shape this checkout builds. Bumped by the migration that changes it. */
export const TEMPLATE_SCHEMA_VERSION = '2026.09.12'

/**
 * Every version this checkout can read and write, newest first.
 *
 * A version leaves this list when the migration that would carry it forward
 * stops existing — which is a deliberate act, not an omission.
 */
export const SUPPORTED_SCHEMA_VERSIONS: readonly string[] = [
  // A link may cross paths within one service. A dependency end gains
  // optional `path` and `scenario` qualifiers naming a cell on another path;
  // an end without them is on the listing path, which is what every earlier
  // end meant, so the step is a stamp. The database took such links in
  // 21000324000000 and nothing stamps this version there, so a target at an
  // earlier version is still one this checkout speaks.
  '2026.09.12',
  // A service carries its own examples. `21000123000000` gave
  // `public.services` an `entity_examples` map — one free-text example per
  // core kind, shown under that kind's definition — and granted it to a
  // signed-in author. The wire format never learned it, so the value was
  // writable from the editor and invisible to the authoring pipeline: an
  // authored example was dropped on the way to the seed and a re-map wrote
  // nothing where a deployment had something. The map is optional and nothing
  // authored moves, so the step is a stamp. No migration stamps this version
  // either — the column has been there since 21000123000000 — so a target at
  // 2026.09.08 is still one this checkout speaks.
  '2026.09.11',
  // `lanes[].role` closes to the eight. 21000122000000 closed the
  // column at the database in 2026.09.08 and the wire format never followed,
  // so a document could validate against references/ir-schema.json and then be
  // refused by the CHECK part-way through an import. The schema now carries
  // the eight as an enum and the step nulls anything else — a generic
  // swimlane, which is how such a role already drew. No migration stamps this
  // version: nothing in the database changed, so a target at 2026.09.08 is
  // still one this checkout speaks.
  '2026.09.10',
  // A path's `triggers` array is its `dependencies`. The database has
  // said `cell_dependencies` since 21000103000000 and this app's own domain
  // layer since release 1.5.0; the IR was the last estate still spelling it the
  // retired way, and the owner settled all three together. A field rename, so
  // every authored value stays put and a signed scenario re-anchors.
  '2026.09.09',
  // The lane vocabulary closes. 21000122000000 renamed the roles it
  // retired, folded the back-office systems role into backstage touchpoints,
  // gave the storyboard row its own name, and closed `lanes.lane_role` to
  // eight values with a CHECK — then stamped a database with this version and
  // taught no list of versions the value. So a target that had run every
  // migration in order read as INCOMPATIBLE here and to
  // scripts/check-target-schema.mjs: a check written to catch a target that is
  // behind was failing the one that was exactly right.
  //
  // The value is ADDED to this list rather than moved into place. It is
  // stamped inside an applied migration and inside the generated portable
  // core, and an applied record keeps the spelling it was written with — so
  // 2026.09.09 stays where it is and the chain runs .07 -> .08 -> .09. A file
  // that authored a lane role by its retired spelling moves.
  '2026.09.08',
  // A touchpoint is a thing the service owns: the `touchpoints`
  // registry, optional in the IR; placements still name theirs by name and
  // the import mints the rest. Nothing authored moves.
  '2026.09.07',
  // A placement says what a tool does here: `touchpoints[].url` and
  // `.screenshots` become resources on the placement, and `.role` arrives.
  // A file that authored either URL field moves.
  '2026.09.06',
  // A resource keeps its id, knows its cell, and one of them is featured.
  // `resources.kind` is `link | attachment` and `featured` arrives; a file
  // that authored `other` moves.
  '2026.09.05',
  // `scenarios.layout` is `stacked | merged`. `single` folded into
  // stacked — one path stacked is one band — and merged, until now a
  // session-only display, is a value the row holds, so a scenario left
  // merged opens merged. A file that authored `single` moves.
  '2026.09.04',
  // A cell's `picture` is its `frame`. One word served two ideas — the
  // image on a cell, and the border a walkthrough draws around one — and the
  // column took it. `slice_items` became `slides` in the same migration; the
  // IR never carried that table, so only the cell field moves here.
  '2026.09.03',
  '2026.09.02',
  // The dependency kinds became `leads_to` and `enables`. Not a pair of
  // renames: `needs` put the source at the opposite end from `enables`, so
  // 21000114000000 and the IR step both TURN those edges around. This is the
  // only bump so far that moves authored content, so it is the only one that
  // can change a signed scenario's content hash.
  '2026.09.01',
  // `cells.links` split into `resources` and `cell_touchpoints`. One
  // column held what a cell points at and the prose about a touchpoint used
  // at it; the IR splits with it, so a 2026.08.27 file authors a `links`
  // array this template no longer reads.
  '2026.08.31',
  // propositions → business_models, the last row of the vocabulary map that
  // applied to this package. `evidence.proposition_question_key` keeps
  // the word on purpose: the three validation questions ARE propositions.
  '2026.08.27',
  // The IR can author a `needs` edge: dependency edges carry an optional
  // `kind`, absent meaning `trigger`. No DDL — cell_dependencies.kind has
  // existed since 20260729120000; what moved is the IR's ability to say it.
  '2026.08.26',
  // Lane vocabulary: lanes, cell_dependencies, services, scenarios, position,
  // summary.
  '2026.08.25',
  // The original template shape: lanes, cell_dependencies, services,
  // scenarios, {row,column,slot,order}_position, summary.
  '2026.07.16',
]

export function isSchemaVersionSupported(version: string): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.includes(version)
}
