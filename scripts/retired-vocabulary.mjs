/**
 * The rename map — the one list the vocabulary checks agree on, and the only
 * place the map is written down.
 *
 * It used to have a documented twin. `CONTEXT.md` carried the same table in
 * prose, this file carried it in code, and
 * `scripts/tests/retired-vocabulary.test.mjs` held the two together — two lists
 * on purpose, so that reformatting a markdown table could not break a build
 * while a drifted table could still fail one. #137 made the glossary a glossary
 * again: a document that defines terms and stops. With the prose half gone
 * there is no pair left to hold together, and this file is both halves at once
 * — the list CI acts on, and the commentary a person reads to learn why a word
 * left.
 *
 * Ported from an instance built on this template, whose renames these are —
 * and not copied: the rows differ, because `sets_off` and `cells.maturity`
 * never existed here and `description` → `summary` did.
 *
 * Read by:
 *   - `scripts/check-retired-identifiers.mjs`  (Check A — database identifiers)
 *   - `scripts/check-database-names.mjs`       (Check B — names inside strings)
 *   - `scripts/tests/retired-copy.test.mjs`    (Check C — words a person reads)
 *   - `scripts/value-set-claims.mjs`           (retired VALUES in swept markdown)
 *   - `scripts/check-instance-vocabulary.mjs`  (the instance's map, against this schema)
 *
 * Held against the SQL that ran by
 * `scripts/tests/the-map-is-what-the-sql-did.test.mjs`, which reads
 * `supabase/migrations/` and fails a row that claims a rename the series never
 * performed. Its header says what it can and cannot see.
 *
 * ── WHY EACH NAME WENT, AND WHICH ARE NOT IN THE WORD LISTS ────────────────
 *
 * The commentary below moved here from `CONTEXT.md` in #137, word for word,
 * because every paragraph of it is about THESE lists: which renames are
 * carried in the `retired` and `copy` word lists, which are deliberately
 * absent, and what enforces the absent ones instead. The reasoning about words
 * retired as IDENTIFIERS rather than as words — the four spellings a rename
 * sweep breaks and why each stands where it does — sits in the header of
 * `scripts/check-retired-identifiers.mjs`, beside the exemption list that
 * applies it. What changed on the way is the deixis and nothing else: the
 * opening sentence used to say the map was recorded in the file a person reads
 * to learn the vocabulary, and three later phrases pointed at a table or a
 * definition that sat on the same page. A reference that points at nothing is
 * the one thing a verbatim move cannot keep.
 *
 * These renames landed across `21000103`–`21000122`. They are recorded with
 * the map because a sweep that catches every occurrence of a retired word needs
 * to know which occurrences are not residue. The last block closes the lane
 * vocabulary (`21000122000000`): the tech lanes become touchpoints, `support_systems`
 * splits into `support_actions` (people) and `backstage_touchpoints` (systems),
 * `visual` becomes `storyboard` (the app's own half of that one — file names,
 * components, a data attribute — followed in #391, held by no list here),
 * `step_visual` is dropped, and the design system keeps one word for each of
 * its two markers — `badge` for a descriptive one,
 * `tag` for one of a set. The `pill`/`chip` row carries no migration because no
 * database object ever bore either word; it is a component-and-copy rename,
 * held by `scripts/tests/badge-and-tag.test.mjs` over every name under `src`.
 *
 * **These are the current names.** An `alter table … rename` moves the table and
 * the column and nothing else — the index, the constraint, the policy, the
 * trigger, the comment and every plpgsql body keep the name they were created
 * with. `21000102`'s `__rename_schema_objects` moved those from the catalogue
 * rather than from a hand-written list, and `scripts/check-retired-identifiers.mjs`
 * now checks that nothing came back.
 *
 * The reasoning, where it is worth knowing. `row` and `column` named how a lane
 * and a step happen to be *drawn* today, and the axis is a rendering fact rather
 * than a domain one. "Lifecycle" was not a level above the service — it *was* the
 * service, wearing a longer name. `enables` was left alone, because it was already
 * the plain word for what it means.
 *
 * `21000116000000` is one migration answering two complaints. **`_type` is a
 * suffix apologising for a name**: `paths.path_type`, `slices.slice_type` and
 * `scenarios.view_type` all said "the kind of thing this is" in a column that
 * could say `kind`, which `cell_dependencies` already did. And **one word per meaning** — a `name` is
 * what you navigate by, a `title` is authored content, a `summary` is the
 * sentence that describes the thing, and a `note` is an aside beside it.
 * `findings.note` was never an aside; it is the finding's own sentence.
 *
 * **`21000208000000` is the one place a `note` stopped being an aside and kept
 * the word anyway**, and it is worth saying why rather than leaving the reader
 * to notice. `21000116000000` deliberately spared `evidence.note` on the
 * argument that a source's note is an aside beside the source; measured on the
 * deployment three months later, the field beside it that was meant to carry
 * the source's own content — `evidence.excerpt`, "the quoted passage" — held
 * two values in 66 rows, one of them a summary. The aside was doing the work.
 * So `excerpt` folds into `note` and `evidence.ref` goes with it, and the
 * doctrine survives with one honest exception: on `evidence` the note IS the
 * prose, because the column that claimed to be turned out never to be. That is
 * a fold, not a licence — `findings.summary` is still a summary, and a new
 * column whose job is the thing's own sentence still gets `summary`.
 *
 * Neither pair carries a `rename column`: `excerpt` cannot be renamed onto a
 * `note` that already exists, so an `update` moves the prose and the column is
 * dropped; `ref` goes nowhere at all and the migration refuses rather than
 * destroy a locator it cannot turn into a sentence. Both words stay live
 * English — a JSON Schema `$ref`, a Supabase project ref, a React ref, and the
 * standing "no verbatim excerpts" rule the skills state — so the row enforces
 * nothing.
 *
 * **Four of those words are retired as identifiers and NOT as words**, which is
 * why their rows enforce nothing and this paragraph exists — a check that
 * deliberately ignores a word has to say so, or the next person reads the silence
 * as an oversight and closes it:
 *
 * - **`label`** — `cell_dependencies.label` became `.name`, but a form control
 *   has a label and half this tree's components take one as a prop. What was
 *   retired is the column, not the noun.
 * - **`description`** — `package.json` has one, so does every tool spec. Only
 *   `slices.description` moved, and `21000108000000` had already moved the rest.
 *   The row is `cell_dependencies.label`, `slices.description`, `slices.origin`
 *   together because one migration answered all three.
 * - **`origin`** — still the live import-provenance column on `cells`, `phases`,
 *   `scenarios`, `paths`, `lanes` and `steps`. Only `slices.origin` became
 *   `authorship`, because on a slice the question is who WROTE it, not where it
 *   came from — a person may author one outright.
 * - **`business_model`** — the singular is the retired TABLE name and the live
 *   domain term at once. `21000111000000` renamed `propositions` to it and took
 *   the singular from the noun rather than from the convention around it; this
 *   migration fixes the number without disturbing the word.
 *
 * `finding` is the same case: the bare word is the live domain term, defined
 * in `CONTEXT.md`. What `21000116000000` retired is the bare TABLE name, which
 * never said whose findings these were.

 * **`slice_items` enforces, since `21000129000000` finished the rename.** The
 * table became `slides` in `21000115000000`, which moved every dependent name a
 * catalogue holds — the four constraints, the two indexes, the trigger, the four
 * policies — and missed the one no catalogue holds: the text a function body was
 * created with. `slices_referencing` is `language sql`, so its body survived the
 * rename verbatim and still selected `from public.slice_items`; calling it
 * raised `42P01`, which took `deletion_impact` and every delete RPC that reads
 * it down with it (#171). The row therefore sat here for four migrations
 * enforcing nothing, because keying the fragment would have failed
 * `check:identifiers` on that BODY — its `function body` branch reads
 * `pg_proc.prosrc`, so it saw the defect and correctly refused to call it
 * residue. (Only that one. The static twin, `scripts/tests/portable-schema.test.mjs`,
 * stays green either way: it blanks single-quoted strings before tokenising,
 * and a dollar-quoted body full of `'…'` shifts the pairing enough to swallow
 * the region the name sits in. A body is the one place the file-reading sweep
 * cannot follow the catalogue-reading one — which is the same sentence this
 * defect is written in, one estate over.)
 *
 * `21000129000000` rewrote the body, so the fragment is in the `retired` list
 * now and the dump sweep is green on it. What the fragment caught on the way in
 * is the second copy of the same defect, one estate over:
 * `scripts/agent-harness/run.mjs` asked PostgREST for the retired relation as an
 * embed, which is Check B's subject and no compiler's — it is `slides` there
 * now. A guard flipped on is worth the finding it makes on its first run.
 *
 * **One rename in this vocabulary is not in the table**, because it never was an
 * identifier and because it ended in no word at all. `evidence`, `findings`,
 * `slices` and `slides` were the **derived layer**, then the *analysis tier*, and
 * are now four records with an owner each — the table under `CONTEXT.md`
 * § What the skills produce. Both collective nouns failed the same way, by
 * claiming something untrue of half the set:
 *
 * - *derived layer* — only `findings` is derived; a person may author a slice.
 *   And `layer` is the spelling `21000104000000` retired when `layers` became
 *   `lanes`, so the word was built on a word this template had withdrawn. It was
 *   still being shipped to agents in `skills/slice/SKILL.md`.
 * - *analysis tier* — evidence is source material and a slice is a presentation
 *   for an audience. Neither is analysis. It also collided with `tier`, which
 *   already means an access level here (`20260818002000_service_account_tier`),
 *   so one word named both what a reader may write and what they may write it
 *   to.
 *
 * Nothing in the catalogue ever moved, which is why no migration carries either
 * word. What enforces the replacement is not this vocabulary map but the write
 * surface: `scripts/tests/who-writes-what.test.mjs` holds the ownership table
 * against the write surface, so a renamed tool or an unowned new write fails
 * `npm test`. That is the check neither collective noun ever had — both were
 * adopted, both went stale, and nothing anywhere noticed.
 *
 * **THE EDGE LIST FINISHED ITS RENAME IN THREE ESTATES, AND THE ROW NOW HOLDS
 * ALL THREE.** `21000103000000` renamed the table in `2026.07`, release 1.5.0
 * renamed the domain layer above it (`BlueprintData.dependencies`,
 * `remapMergedPathDependencies`, and the prose around the arrows), and the
 * INTERCHANGE FORMAT was the estate left over: `references/ir-schema.json` went
 * on calling a path's edge array `triggers`, and every reader of an IR file
 * with it. The owner settled the word for all three at once; the wire-format
 * half is #159.
 *
 * `path.triggers` therefore sits on the `cell_triggers` row rather than on one
 * of its own: it is the same concept in a fourth spelling, not a fourth rename.
 * It enforces nothing here, and could not. The `retired` list matches
 * SUBSTRINGS of database identifiers, and a JSON member of an authored file is
 * neither an identifier the sweep reads nor a word a reader meets on screen;
 * the `copy` list would have to key on the bare word `triggers`, which is a
 * database trigger's plural in half the documents in this tree. What holds the
 * wire format instead is the thing that holds every wire format — a schema
 * version. `references/ir-schema.json` names the array `dependencies` at
 * `2026.09.09`, `scripts/validate_ir.py` refuses a file at any older stamp, and
 * `scripts/migrate_ir.py` carries an old document across; the fixtures at
 * `2026.07.16` and `2026.08.25` keep the old spelling and prove the carry.
 */

/**
 * One row per rename, ordered as the series landed them.
 *
 * `renames` / `migrations` are the translation itself: where each retired name
 * went, and the migration that moved it. They are the whole of what the prose
 * table used to say, which is why deleting that table cost nothing.
 *
 * `renames` IS A LIST OF PAIRS AND NOT TWO LISTS SIDE BY SIDE, since #279. It
 * used to be a `was` array beside an `is` array, which reads positionally
 * because nothing else is on offer — and a positional reading cannot say what
 * a FOLD did. `21000116000000` turned both `unhappy` and `alternative` into
 * `variant`; the two arrays said `unhappy` / `alternative` on one side and
 * `exception` / `variant` on the other, so the map claimed `unhappy` became
 * `exception` — a value that already existed, meant something else, and was
 * never a destination. The instance's map says exactly that and is right
 * about its own database, whose `20260821220000` really did send `unhappy` to
 * `exception`; this row was carried across from it and the divergence came
 * with it. A fold is the commonest kind of rename, and a shape that cannot
 * express one aims the sweeps that read it in a direction the database never
 * went. Two entries may name the same `to`, and that is the fold, said out
 * loud.
 *
 * A pair's `to` may be `null`: the name was DROPPED rather than renamed.
 *
 * A pair's `because` is present exactly when no single statement in the row's
 * migrations performs it — a JSON member of an authored file, a column copied
 * into another table rather than renamed, a name dropped. It is an excuse and
 * it is held to being true: `scripts/tests/the-map-is-what-the-sql-did.test.mjs`
 * fails a `because` on a pair whose statement is right there in the migration.
 *
 * `kept` is the other half of a fold, and the half the old shape had nowhere to
 * put: a value that already existed on the same column, kept its own meaning,
 * and was never a destination. Only the path-kind row carries one, because that
 * is the row where a non-destination sitting in the `is` column was the lie.
 *
 * `retired` is what the identifier checks actually match: SUBSTRINGS, not whole
 * words. A word-boundary pattern is what let `cells_layer_step_slot_unique`
 * survive `\mlayer_id\M` upstream — `_` is a word constituent in Postgres
 * regex — and `21000104`'s header records having to write that name its own
 * pattern for the same reason. Every fragment is asserted to be a substring of
 * one of the same row's retired names, so the enforced words cannot wander from
 * the names they came from.
 *
 * `copy` is the prose spelling of the same retirement, for the guard over words
 * a person reads on screen.
 *
 * A row may enforce NOTHING — an empty `retired` and `copy` — when the retired
 * spelling is still a live word elsewhere in the schema. That is a judgement
 * recorded in the row, not an omission, and the test requires the row to say so.
 *
 * `was` and `is` are DERIVED from `renames` and kept for the four readers that
 * ask "which names left" and "which names stand" without caring which became
 * which. Deriving them is what stops the two lists drifting from the pairs, and
 * what makes `is` say `variant` once where the old shape said it twice.
 */
export const RENAME_MAP = Object.freeze(
  [
    {
      renames: [
        { from: 'layers', to: 'lanes' },
        { from: 'layer_role', to: 'lane_role' },
        { from: 'cells.layer_id', to: 'cells.lane_id' },
      ],
      migrations: ['21000104000000'],
      retired: ['layer'],
      // `CanvasAnnotationLayer` is a RENDERING layer and an unrelated concept —
      // `21000104`'s header says so explicitly. It is an identifier in the
      // frontend, not a database name and not reader-facing copy, so neither
      // check that reads this row can reach it.
      //
      // BOTH LISTS STAND, AND THE TWO SENSES ARE SEPARATED BY SUBJECT (#327).
      // `21000104` was carried into the prose as a word replacement, so eleven
      // sentences that used `layer` in its ordinary sense came out with `lane`
      // substituted into the middle of an English word or an unrelated idea —
      // a stylesheet not inside an `@layer`, the tabs stacked over the base
      // view, the design system's own token tier. Restoring them raised the
      // question of whether the copy list has to learn which sense it is
      // looking at, and the answer is that it does not: what `21000104`
      // retired is the COLUMN, not the English word, and Check C already draws
      // that line on the axis its own header names. Its subject is JSX text
      // and the five reader-facing props with comments removed, so a token
      // tier — which lives in a comment, a `.ts` module or a stylesheet —
      // reaches no reader and is never read. The alternative was to narrow the
      // pattern to `layer` beside "swimlane" / "role" / "row" / "stage" /
      // "blueprint", and that is the move the header forbids: it would let
      // `aria-label="Add a layer"` through, which is the retired NAME on
      // screen and the one case Check C plants to prove itself.
      // `scripts/tests/retired-copy.test.mjs` holds both halves, and a third
      // guard beside them fails on the shape a mechanical rename leaves behind
      // so this class cannot recur on the next one.
      //
      // THAT WAS HALF OF IT, AND #267 IS THE OTHER HALF. The residue sweep
      // decides by the DICTIONARY: a replacement landing INSIDE a word leaves
      // a non-word, and no sentence can want one. A rename over prose also
      // produces valid English standing for the wrong idea, which no
      // dictionary separates — and ninety of those
      // survived the restoration above, in comments, in test names, in a prop
      // typed `ArrowLayer` and called `lane`, and in one paragraph a reader
      // meets. `scripts/tests/a-lane-is-not-a-layer.test.mjs` is the guard for
      // that half, and it decides by the COMPANY the word keeps: a lane is a
      // row of the board, so it is not composited, does not stack, is not a
      // rung of an animation and is not a tier of software. Its header carries
      // what it cannot see and the four cheaper shapes that were tried first.
      copy: ['layer', 'layers'],
    },
    {
      // Three estates, one word, and each pair's `to` is where they agree.
      // `21000103000000` moved the table; release 1.5.0 moved the domain layer
      // above it; and the IR's `path.triggers` — the interchange format, and
      // the last estate still spelling it the old way — became
      // `path.dependencies` at IR schema version `2026.09.09` (#159).
      renames: [
        { from: 'cell_triggers', to: 'cell_dependencies' },
        {
          from: 'path.triggers',
          to: 'path.dependencies',
          because:
            'the IR is an authored file, not a database object. No migration ' +
            'renames a JSON member, and what holds a wire format is its schema ' +
            'version — `references/ir-schema.json` names the array ' +
            '`dependencies` at `2026.09.09`.',
        },
      ],
      migrations: ['21000103000000'],
      retired: ['cell_trigger'],
      // Not `trigger` alone: a database trigger (`cells_validate_path_match`)
      // is a live subject in these documents, and the kind value that carried
      // the word has its own row below. `path.triggers` adds no fragment and no
      // copy word either — a member of an authored JSON file is neither an
      // identifier the sweep reads nor a word on screen, and the schema version
      // is what holds a wire format. The header says which version and which
      // fixtures prove the carry.
      copy: ['cell trigger', 'cell triggers'],
    },
    {
      renames: [
        { from: 'service_lifecycles', to: 'services' },
        { from: '*_service_lifecycle_id', to: 'service_id' },
      ],
      migrations: ['21000106000000'],
      // `lifecycle` bare, not `service_lifecycle`: `21000106` ran a second
      // pass on the bare word precisely because objects carried it without the
      // prefix.
      retired: ['lifecycle'],
      copy: ['lifecycle', 'lifecycles'],
    },
    {
      renames: [
        { from: 'service_scenarios', to: 'scenarios' },
        { from: '*_service_scenario_id', to: 'scenario_id' },
      ],
      migrations: ['21000107000000'],
      retired: ['service_scenario'],
      copy: ['service scenario', 'service scenarios'],
    },
    {
      // Four names, one destination — the first fold in the series, and the
      // one the old two-array shape happened to state correctly because four
      // against one leaves nothing to pair off.
      renames: [
        { from: 'row_position', to: 'position' },
        { from: 'column_position', to: 'position' },
        { from: 'slot_position', to: 'position' },
        { from: 'order_position', to: 'position' },
      ],
      migrations: ['21000105000000'],
      retired: ['row_position', 'column_position', 'slot_position', 'order_position'],
      copy: ['row position', 'column position', 'slot position', 'order position'],
    },
    {
      renames: [{ from: 'description', to: 'summary' }],
      migrations: ['21000108000000'],
      // ENFORCES NOTHING, deliberately. `description` is a word rather than an
      // identifier: `21000108` renamed it on five tables and its own header
      // records that a sixth still has one (`slices.description`, prose the
      // author writes about the slice) and that `tech_description` is a link
      // TYPE. A fragment check keyed on `description` would flag both and need
      // an exemption for each, and an exemption list is where a real finding
      // hides. The rename has its own guard already: `21000108` asserts
      // `\mdescription\M` against the three function bodies that name one.
      retired: [],
      copy: [],
    },
    {
      renames: [{ from: 'propositions', to: 'business_model' }],
      migrations: ['21000111000000'],
      // The PLURAL, in both lists, and this is not a pattern narrowed to dodge
      // a case. The retired IDENTIFIER is the table `propositions`. Singular
      // `proposition` was never one: its only occurrence is
      // `evidence.proposition_question_key`, a live column recording which of
      // the three validation questions an evidence row answers — and those
      // three ARE propositions in the ordinary sense. The rename moved the
      // container, not the concept, so there is nothing here to exempt.
      //
      // THE COPY LIST HELD THE SINGULAR UNTIL #89, and that was the same
      // over-reach one column to the left, caught the first time a panel had
      // to say the word. `cells.value_props` abbreviates "value proposition"
      // and nothing else — `21000111`'s own header says the phrase is what
      // `propositions` collided with, "a CELL's value proposition", one level
      // down. A label reading `Value proposition` is therefore the schema's
      // word spelled out, not a retired one surviving, and this list keying
      // on the plural leaves the retired NAME covered on screen exactly as it
      // is in identifiers. Retiring a word the vocabulary still means is how
      // a guard teaches people to route around it.
      retired: ['propositions'],
      copy: ['propositions'],
    },
    {
      // Values, not identifiers: the two `cell_dependencies.kind` values were
      // renamed and the `needs` rows turned around (source and target swapped)
      // because `enables` reads source-first and `needs` did not. Not a copy
      // word and not an identifier fragment — `scripts/check-dependency-kinds.mjs`
      // sweeps the code-span form through every rulebook tree instead.
      //
      // Two pairs and no fold: these two really are one-for-one, which is
      // exactly the claim the pair shape lets this row make and the old one
      // could only imply.
      renames: [
        { from: "cell_dependencies.kind = 'trigger'", to: "cell_dependencies.kind = 'leads_to'" },
        { from: "cell_dependencies.kind = 'needs'", to: "cell_dependencies.kind = 'enables'" },
      ],
      migrations: ['21000114000000'],
      retired: [],
      copy: [],
    },
    {
      // `21000115000000`, and the row was missing until #324 went looking for
      // it. `picture` said what the thing is MADE OF where every neighbour
      // says what it is FOR: one image on one cell is a `frame`, and a step's
      // frames read across the lanes are its strip.
      //
      // The fragment enforces, unlike most of the block below it, because
      // `picture` is a substring of nothing that survives in the schema — the
      // column was the only database object that ever carried the word. The
      // copy list is safe for the same reason one level out: no reader-facing
      // string says it. What the word IS still doing here is naming things in
      // the app — `storyboardPictures`, `getTechItemDetailPictures` — and
      // neither list reaches those, which is the split this map keeps
      // everywhere: a retired COLUMN is not a retired English word. (The first
      // of those examples was `visualPictures` until #391 moved the app's half
      // of the row below; the word this row is about did not move with it.)
      renames: [{ from: 'cells.picture', to: 'cells.frame' }],
      migrations: ['21000115000000'],
      retired: ['picture'],
      copy: ['picture', 'pictures'],
    },
    {
      // The other half of `21000115000000`, and the half that had no row at
      // all. A slide is one screen of a slice; `slice_items` named the row and
      // let the schema's own prose call it a frame, which is the word for one
      // image on one cell. `caption` became `title` under the same rule as the
      // renames below it: a title is authored content, not structure.
      //
      // ENFORCES, since `21000129000000` — see the header. The fragment was
      // held out while `slices_referencing`'s body still selected from the
      // retired table, because the dump sweep would have failed on that defect
      // rather than on residue; the migration that rewrote the body is what
      // lets it in. `slice_items` rather than `slice_item`: the plural is the
      // name the table bore, and every dependent name 21000115 had to move
      // (`slice_items_pkey`, `slice_items_slice_id_idx`) carries it as a
      // substring anyway.
      //
      // `caption` is NOT a fragment. Text under an image is called a caption
      // and `steps.summary`'s own comment says the word about a strip; what
      // retired is the column, not the noun — the same split the `label` row
      // below records.
      renames: [
        { from: 'slice_items', to: 'slides' },
        { from: 'slice_items.caption', to: 'slides.title' },
      ],
      migrations: ['21000115000000', '21000129000000'],
      retired: ['slice_items'],
      copy: ['slice item', 'slice items'],
    },
    {
      // A fold: one `update … where layout in ('side-by-side', 'integrated')`,
      // both landing on `stacked`. The old shape could only say this by
      // writing `stacked` twice, which reads as two renames that happen to
      // agree rather than as one statement moving two values.
      renames: [
        { from: "scenarios.layout = 'side-by-side'", to: "scenarios.layout = 'stacked'" },
        { from: "scenarios.layout = 'integrated'", to: "scenarios.layout = 'stacked'" },
      ],
      migrations: ['21000116000000'],
      retired: [],
      copy: [],
    },
    {
      // THE FOLD THIS SHAPE EXISTS FOR (#279). `21000116000000` runs one
      // statement — `set kind = 'variant' where kind in ('unhappy',
      // 'alternative')` — so BOTH spellings land on `variant`. `exception` is
      // in `kept` and not on the right of any pair: it already existed, it
      // carries "this went wrong", and the migration's own note is that
      // `unhappy` was only ever a second spelling of `variant` with a mood
      // attached. Read positionally, the two-array form said `unhappy` became
      // `exception`, which would send a sweep looking for the wrong word on
      // the wrong rows.
      //
      // The instance's map really does say `unhappy` → `exception`, and is
      // right: its `20260821220000` ran two updates and sent `unhappy` one way
      // and `alternative` the other. Two databases, two histories, one row
      // carried across — which is why a map has to be read against the
      // migrations that ran HERE.
      renames: [
        { from: "paths.kind = 'unhappy'", to: "paths.kind = 'variant'" },
        { from: "paths.kind = 'alternative'", to: "paths.kind = 'variant'" },
      ],
      kept: ["paths.kind = 'exception'"],
      migrations: ['21000116000000'],
      retired: [],
      copy: [],
    },
    {
      renames: [{ from: "scenarios.layout = 'single'", to: "scenarios.layout = 'stacked'" }],
      migrations: ['21000117000000'],
      retired: [],
      copy: [],
    },
    {
      renames: [{ from: "resources.kind = 'other'", to: "resources.kind = 'attachment'" }],
      migrations: ['21000118000000'],
      retired: [],
      copy: [],
    },
    {
      // #111. A placement is summary + role. Its two URL columns — the
      // screenshots of the tool at this moment, and where it lives — became
      // rows in `resources` carrying the placement's id. No identifier
      // retires: `url` is a live column on `resources`, and `screenshots` is
      // English elsewhere in these documents (a render check takes them).
      //
      // BOTH COLUMNS LAND ON `resources.url`, which is the fold the old shape
      // got wrong in a second way (#279): it paired `screenshots` with
      // `resources.kind`, and no screenshot ever became a kind. Every url and
      // every element of every `screenshots[]` is copied into `resources.url`;
      // `resources.kind` is what tells the two apart afterwards — `link` for
      // the featured one the placement led with, `attachment` for each
      // screenshot in author order.
      renames: [
        {
          from: 'cell_touchpoints.url',
          to: 'resources.url',
          because:
            '21000119000000 does not rename this column, it COPIES it: an ' +
            'insert makes a featured `link` resource on the placement, and the ' +
            'column is then dropped.',
        },
        {
          from: 'cell_touchpoints.screenshots',
          to: 'resources.url',
          because:
            'an array became rows, not a column: each element is inserted as ' +
            'an `attachment` resource on the placement in author order, and ' +
            'the column is then dropped.',
        },
      ],
      migrations: ['21000119000000'],
      retired: [],
      copy: [],
    },
    {
      renames: [{ from: 'business_model', to: 'business_models' }],
      migrations: ['21000116000000'],
      // Plural, like every other table. `21000111000000` took the singular
      // from the noun rather than from the convention around it, which is why
      // this row exists one migration later instead of being folded into that
      // one: the rename was right and the number was not.
      retired: [],
      copy: [],
    },
    {
      renames: [
        { from: 'findings', to: 'audit_findings' },
        { from: 'findings.check_name', to: 'audit_findings.check_key' },
        { from: 'findings.note', to: 'audit_findings.summary' },
      ],
      migrations: ['21000116000000'],
      // `finding` alone is NOT retired — it is the live domain word, defined
      // in CONTEXT.md, and a panel has to be able to say it. What is retired
      // is the bare TABLE name, which said nothing about whose findings these
      // are, and `check_name`, which called a key a name.
      retired: ['check_name'],
      copy: ['check name'],
    },
    {
      renames: [
        { from: 'paths.path_type', to: 'paths.kind' },
        { from: 'slices.slice_type', to: 'slices.kind' },
        { from: 'scenarios.view_type', to: 'scenarios.layout' },
      ],
      migrations: ['21000116000000'],
      // `_type` is a suffix apologising for a name. All three said "the kind
      // of thing this is" in a column that could say `kind`, which
      // `cell_dependencies` already did. Two of the three land on a column
      // called `kind` and the third does not, which is a coincidence the pair
      // shape states and the two-array form left the reader to work out.
      retired: ['path_type', 'slice_type', 'view_type'],
      copy: ['path type', 'slice type', 'view type'],
    },
    {
      renames: [
        { from: 'cell_dependencies.label', to: 'cell_dependencies.name' },
        { from: 'slices.description', to: 'slices.summary' },
        { from: 'slices.origin', to: 'slices.authorship' },
      ],
      migrations: ['21000116000000'],
      // One word per meaning: a `name` is navigated by, a `title` is authored,
      // a `summary` describes, a `note` is an aside.
      //
      // NOT `label`, `description` or `origin` as bare fragments. Each is a
      // live word elsewhere in this tree — a form control has a label, a
      // package has a description, and `origin` is the import-provenance
      // column on cells and phases, which this migration does not touch.
      // Narrow the subject, never the word list.
      retired: [],
      copy: [],
    },
    // The lane vocabulary closes (`21000122000000`). A "tech" lane never held
    // only software — it held the things a moment happens THROUGH, which is a
    // touchpoint — so the two tech roles become touchpoints. Both spellings
    // retire outright: neither is a substring of any surviving database name,
    // and the lane LABELS ("Front Stage Tech") are free-form text the migration
    // does not touch, so the copy guard reads the ROLE aloud and not the label.
    {
      renames: [
        { from: 'frontstage_tech', to: 'frontstage_touchpoints' },
        { from: 'backstage_tech', to: 'backstage_touchpoints' },
      ],
      migrations: ['21000122000000'],
      retired: ['frontstage_tech', 'backstage_tech'],
      copy: ['frontstage tech', 'backstage tech'],
    },
    // `support_systems` did two jobs — back-office people and back-office
    // systems. The people are `support_actions` (a new role for a lane an
    // adopter may add); the systems are touchpoints, and every support_systems
    // lane in this template is a systems lane, so each becomes
    // `backstage_touchpoints`. Two rows therefore land on the same word without
    // being the same fold, which is why they stay two rows: `backstage_tech`
    // above was a spelling, this is a split.
    {
      renames: [{ from: 'support_systems', to: 'backstage_touchpoints' }],
      migrations: ['21000122000000'],
      retired: ['support_systems'],
      copy: ['support systems'],
    },
    // `visual` said what the MEDIUM is where every sibling role says what the
    // row is FOR; it is `storyboard` now, the word the panel and the walkthrough
    // already used. `step_visual` named no lane here — a step never carried its
    // own storyboard variation — and is dropped, its concept folded into
    // `storyboard`.
    //
    // BOTH LISTS ALREADY STOOD WHEN `21000122000000` LANDED, AND NEITHER OF
    // THEM COULD SEE THE APP (#391). Check A reads database identifiers and
    // Check C reads JSX text and five props, so between them sat what the
    // `pill`/`chip` row calls the app's own vocabulary — a component, a file
    // name, a data attribute, a flag — and the whole walkthrough surface was
    // still spelled `Visual` two migrations later. It is `Storyboard` now:
    // eight files renamed, `data-storyboard-walkthrough-modal`, and
    // `BLUEPRINT_STORYBOARD_WALKTHROUGH_ENABLED` — which is still `false`, and
    // the machinery under it deliberately retained. The lists did not change;
    // the tree caught up with them.
    //
    // WHAT DID NOT MOVE, and why each is a judgement rather than a miss.
    // `Visual` stays as a key of `LEGACY_NAME_TO_ROLE` and `LANE_STYLES`: it
    // is a lane DISPLAY NAME in data that predates `lane_role`, and a shim
    // that stops recognising the name it exists for recognises nothing.
    // `/step-visual-placeholder.svg` stays for the same reason one level down
    // — it is a sentinel VALUE a `cells.frame` may carry, so renaming the
    // asset would silently turn every placeholder into a real frame. And the
    // ordinary English adjective stays wherever it is one: a panel is
    // `visually` de-emphasised, the WebKit `visual` viewport is a platform
    // term, and a divider band has a `visual` width. That last class is what
    // `MANGLED` in `scripts/tests/retired-copy.test.mjs` grew three shapes for.
    {
      renames: [
        { from: 'visual', to: 'storyboard' },
        {
          from: 'step_visual',
          to: null,
          because:
            'dropped, not renamed. `step_visual` named no lane here, so ' +
            '21000122000000 has no update for it — what it has is the closed ' +
            'set, which sends any role outside the eight to null. The concept ' +
            'is folded into `storyboard`; the value went nowhere.',
        },
      ],
      migrations: ['21000122000000'],
      retired: ['visual', 'step_visual'],
      copy: ['visual', 'step visual'],
    },
    /*
      THE DESIGN SYSTEM'S OWN VOCABULARY, which had four words for two ideas.

      A **badge** describes the thing it sits on: one per thing, not drawn from
      a set, never interactive — the divider caption, a touchpoint's own face.
      A **tag** is one value out of a set, selectable or removable. "Chip" and
      "pill" were a third and fourth name for those same two ideas and are not
      names any more.

      FOUR PAIRS, NOT TWO (#279). Neither retired word maps onto one surviving
      word: a pill could be either idea and so could a chip, and which one a
      given site takes is decided by the definition above rather than by where
      the word sat in a list. Written as two pairs this row would claim `pill`
      became `badge` and `chip` became `tag`, and the deployment's own renames
      refute it — `coverContent.chip` became `commandCopy`, which is neither.
      This row has no migration, so the pairs carry no `because`: there is no
      SQL for them to be an excuse about.

      `retired` is empty and that IS the entry: no database object was ever
      called either word, so the identifier sweep has nothing to forbid, and a
      guard that cannot fire is a comment wearing a check's clothes. The copy
      list costs nothing — neither word reaches a reader today — and is what
      keeps it that way.

      Between those two lists sat the app's own vocabulary — a component, a
      prop, a constant, a variant string, a data attribute, a file name — held
      by review alone, which is how `FloatingSidebarPill`, `SliceRefocusPill`
      and `PathNotionPill` survived the touchpoint half of the rename. Since
      #158 that half is a check, whose subject is every NAME under `src` with
      comments removed; it took `pill` alone, because `coverContent.chip` was
      still a live name here and retiring it was its own change.

      #324 IS THAT CHANGE, and the check now takes both words under the name
      the instance's own copy carries — `scripts/tests/badge-and-tag.test.mjs`.
      Every spelling came from the deployment rather than being invented here:
      the cover's copy button is `CoverCommandCopy` reading `commandCopy`, the
      menubar's count is `CompareDifferencesCount`, and the ledger's markers
      split along the definition above — a `VerdictBadge` describes, a
      `FilterTag` selects.
    */
    {
      renames: [
        { from: 'pill', to: 'badge' },
        { from: 'pill', to: 'tag' },
        { from: 'chip', to: 'badge' },
        { from: 'chip', to: 'tag' },
      ],
      migrations: [],
      retired: [],
      copy: ['pill', 'pills', 'chip', 'chips'],
    },
    // A slide's prose is a caption (`21000219000000`). `copy` is empty on
    // purpose: `narrative` is ordinary English elsewhere — a cell's narrative,
    // a numbered narrative, a frame's narrative — and retiring the word would
    // false-positive those. What retired is the column, named as a fragment
    // so the identifier sweep can see it without taking the noun.
    {
      renames: [{ from: 'slides.narrative', to: 'slides.caption' }],
      migrations: ['21000219000000'],
      retired: ['slides.narrative'],
      copy: [],
    },
    // A slide shows a set (`21000220000000`). The single-choice columns — the
    // jsonb `illustration`, then the pool-and-choice of `21000218000000` —
    // fold onto `slide_images`. `copy` is empty: `illustration` is still how
    // the upload helper and the storage bucket are named, and retiring the
    // English word would false-positive those.
    {
      renames: [
        {
          from: 'slides.illustration',
          to: null,
          because:
            'dropped by 21000218000000, then the pool that replaced it is ' +
            'dropped by 21000220000000. A slide now shows a set in slide_images.',
        },
        {
          from: 'slides.illustrations',
          to: 'slide_images',
          because:
            '21000220000000 drops the array: the set is a table, not a column.',
        },
        {
          from: 'slides.active_illustration',
          to: null,
          because:
            'dropped. A chosen upload is a slide_images.image_url member.',
        },
        {
          from: 'slides.active_frame_cell_id',
          to: null,
          because:
            'dropped. A chosen frame is a slide_images.cell_id member.',
        },
      ],
      migrations: ['21000218000000', '21000220000000'],
      retired: ['active_illustration', 'active_frame_cell_id'],
      copy: [],
    },
    // A source carries one note (`21000208000000`). See the header for why the
    // one column `21000116000000` spared is the one that stopped being an
    // aside. `retired` and `copy` are empty on purpose: both words are live
    // English across `references/`, `agents/` and `skills/` — a JSON Schema
    // `$ref`, a Supabase project ref, and the standing "no verbatim excerpts"
    // privacy rule, which is about not pasting interview content into a public
    // artifact and stays true with no column behind it.
    {
      renames: [
        {
          from: 'evidence.excerpt',
          to: 'evidence.note',
          because:
            '21000208000000 does not rename this column, it EMPTIES it: a ' +
            'column cannot be renamed onto a `note` that already exists, so an ' +
            'update moves every excerpt into the note it was an aside beside, ' +
            'and the column is then dropped.',
        },
        {
          from: 'evidence.ref',
          to: null,
          because:
            'dropped, not renamed. A locator is not prose and 21000208000000 ' +
            'will not invent a sentence around one, so it has no update for ' +
            'this column — it refuses instead, and a row still carrying a ' +
            'reference stops the migration. The job the column did is done by ' +
            'a URL written inside the note, which renders as a link.',
        },
      ],
      migrations: ['21000208000000'],
      retired: [],
      copy: [],
    },
    // #552. One name for the thing a deployment runs: template. "Kit" was a
    // second spelling of the same idea — the canonical application every
    // deployment installs — and it reached a reader on the no-database status
    // line. Never a database identifier, so `retired` is empty; the copy list
    // is the whole of the row. Whole-word, because a substring would flag
    // `kitchen`, `toolkit` and every `-webkit-` utility this tree writes.
    // No migration, so the pair carries no `because`: there is no SQL for it
    // to be an excuse about.
    {
      renames: [{ from: 'kit', to: 'template' }],
      migrations: [],
      retired: [],
      copy: ['kit'],
    },
    // A step is the glossary's word for what the board draws as a column, and
    // the create dialog's count field said "Columns" above a value that
    // becomes `path_steps` rows. Nothing in the schema was ever called
    // `column` — `column_position` is retired above — so the identifier list
    // is empty and the copy list is the whole row: a row and a column are how
    // a lane and a step happen to be DRAWN, a rendering fact rather than a
    // domain one. A layout column that is not a step is still safe, because
    // this guard's subject is reader-facing copy only: a `className`, a
    // `data-*` attribute and an identifier are never read. A deployment built
    // on this template already enforced the same row.
    {
      renames: [{ from: 'columns', to: 'steps' }],
      migrations: [],
      retired: [],
      copy: ['column', 'columns'],
    },
  ].map((row) => {
    const renames = Object.freeze(row.renames.map((pair) => Object.freeze({ ...pair })))
    return Object.freeze({
      ...row,
      renames,
      kept: Object.freeze(row.kept ?? []),
      // DERIVED, and derived rather than written. `was` is every name this row
      // retired and `is` every name one of them landed on, deduplicated: a fold
      // states its destination once, so `is` cannot say `stacked` twice or
      // `exception` at all, and neither list can drift from the pairs.
      was: Object.freeze([...new Set(renames.map((pair) => pair.from))]),
      is: Object.freeze([
        ...new Set(renames.map((pair) => pair.to).filter((to) => to !== null && to !== undefined)),
      ]),
      ...Object.fromEntries(
        ['migrations', 'retired', 'copy'].map((k) => [k, Object.freeze(row[k])]),
      ),
    })
  }),
)

/** Every retired identifier fragment, deduplicated, longest first. */
export const RETIRED_IDENTIFIER_FRAGMENTS = Object.freeze(
  [...new Set(RENAME_MAP.flatMap((row) => row.retired))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  ),
)

/** Every retired prose spelling, deduplicated, longest first. */
export const RETIRED_COPY_WORDS = Object.freeze(
  [...new Set(RENAME_MAP.flatMap((row) => row.copy))].sort(
    (a, b) => b.length - a.length || a.localeCompare(b),
  ),
)

/** The current name a retired fragment was renamed to, for the failure message. */
export function replacementFor(fragment) {
  const row = RENAME_MAP.find((entry) => entry.retired.includes(fragment))
  return row ? row.is.join(' / ') : null
}

/**
 * Retired fragments present in an identifier, as substrings. Case-insensitive
 * because Postgres folds unquoted identifiers to lower case and nothing in this
 * schema is quoted.
 */
export function retiredFragmentsIn(identifier) {
  const lower = String(identifier).toLowerCase()
  return RETIRED_IDENTIFIER_FRAGMENTS.filter((fragment) => lower.includes(fragment))
}

/**
 * The shape every exemption in every one of these checks takes.
 *
 *   identifier  what is exempt, exactly as the check names it
 *   because     why, in a sentence a stranger can evaluate
 *   until       the issue that ends it. ABSENT MEANS PERMANENT, and a
 *               permanent entry must be explained in the header of the check
 *               that applies it — see
 *               `scripts/tests/retired-vocabulary.test.mjs`.
 *
 * @typedef {{ identifier: string, because: string, until?: string }} Exemption
 */

/** True when `identifier` is covered by one of `exemptions`. */
export function isExempt(identifier, exemptions) {
  return exemptions.some((entry) => entry.identifier === identifier)
}
