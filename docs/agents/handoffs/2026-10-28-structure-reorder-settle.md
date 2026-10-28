---
summary: Reproduction, review findings and verification for the canvas reorder drop handoff and section-scoped lane creation.
---

# Handoff: structure reorder settle + lane-create rail

**For:** Codex (or any agent picking up `codex/canvas-header-reorder`)  
**Branch:** `codex/canvas-header-reorder`  
**Tracker:** https://github.com/BilLogic/uno-blueprint/issues/1238  
**Original handoff at `6fe07379`:** Cursor session landed section-scoped new-lane create + several settle attempts; the **post-drop flash was still live**. Follow-up findings and verification are recorded below. Do not mark the glitch fixed without a recorded drop on the sample board.

## 1. Fix the post-drop reorder glitch (priority)

### Symptom

In Edit mode, drag a lane (e.g. Journey figures) within its section and drop. The row still **flashes / eases back-and-forth** once before settling. Feels better than before, but not gone.

### What we tried (review these — do not blindly extend)

| Commit / area | Intent | Likely gap |
| --- | --- | --- |
| `data-structure-settling` + CSS `transition: none` | Kill glide during commit | May not cover every layer / remount |
| `flushSync` + optimistic `setQueryData` | Board order before paint | RQ notify was async; later wrapped in `notifyManager.batch` |
| `useCanvasBlueprints` `rowsKey` includes lane/step order | Memo busts on optimistic patch | Still depends on derived path |
| Clear `style.translate` **before** `save` / flushSync | No double-offset under rewrite | May still paint one frame of old DOM seats, or remounted nodes reintroduce motion |

Key files:

- `src/components/blueprint/canvasStructureReorder.ts` — gesture, park, settle, `clearTranslates`
- `src/components/blueprint/useCanvasStructureReorder.ts` — optimistic cache + `flushSync` + `notifyManager.batch`
- `src/hooks/useCanvasBlueprints.ts` — `rowsKey` / derive
- `src/styles/blueprint.css` — `[data-structure-settling]`
- `src/lib/authoringRpc.ts` — `reorder_*` freshness (skip canvas refetch; invalidate other structure keys)

### How to prove a fix

1. Open sample: Setup → Map your service → From your documents.  
2. Edit mode. Drag **Journey figures** one seat within the top band; drop.  
3. Capture or describe: **zero** frames of old-seat flash / ghost / bounce.  
4. Repeat for a step reorder.  
5. Keep unit coverage in `canvasStructureReorder.test.ts` + any new settle regression test.

### Suggested investigation angles (pick what evidence supports)

- Confirm optimistic patch actually changes `blueprint.lanes` order in the same turn the translates clear (React Query observer + `useCompareGridAxis` / `getCanonicalLanes`).  
- Check whether **label rail** parts and **row** parts remount or keep stale transforms / Framer playback.  
- Consider FLIP: keep visual continuity with transforms **after** DOM rewrite, then clear once — rather than clear-then-rewrite.  
- Instrument one drop with `performance.mark` / rAF screenshots if needed; do not claim fixed without that evidence.

## 2. Review the landed changes

Please **review** (not rubber-stamp) the recent commits on this branch, especially:

- `laneInsertSection.ts` — seating, `beforeDivider`, band lock, full-band roles  
- `PathOrderSection.tsx` — section window, `RailDivider`, top/bottom of board bounds  
- `LanePanel.tsx` — `sectionForOrder(path, order)`, auto-role only for narrow bands  
- Reorder settle stack above  
- `WriteFailureNotices` + `--editor-aside-width` centering on the canvas column  

Call out remaining bugs, overfit, or dead paths. Prefer findings over praise.

## 3. Continue the product task (after glitch is proven)

1. **Section rail polish** — Top/bottom bounds use “Top of the board” / “Bottom of the board” when LoI/LoV/internal are absent; keep LoI/LoV as `—— caption ——` read-only separators. Tighten spacing vs the spine if it still fights the circles.  
2. **Live verify create panel** — Insert above Journey figures, between LoI–LoV, below internal: rail shows only that band + correct bounds + filtered roles.  
3. **Toast vs control bar** — Confirm undo notice shares the control bar’s horizontal centre with sidebar open/collapsed.  
4. **Docs** — `docs/guidelines/composition/canvas.md` reorder section should match behaviour once settle is truly fixed.  
5. **Push / PR** — Branch is ahead of origin; open or update PR when glitch + review are done.

## Out of scope unless asked

- Redesigning the whole Add-to-paths chrome beyond section bounds  
- Force-push / amend of shared history  

## Follow-up findings and verification

- **Settle:** clearing translates before the asynchronous query-observer notification painted the old seat. A completed drop's later lost-capture event also cancelled its own parked preview. The preview now stays at its destination until the new order's layout effect clears offsets before paint.
- **Visibility:** the saved layout drew a line after every frontstage action and some touchpoint lanes. A frontstage swap therefore inserted another divider row. Rendering and preview now share one last-frontstage anchor.
- **Geometry:** routing insets were packed as lane content, although boundary routing space belongs to the destination seat. Moving Journey figures below the recipient left a 36-board-pixel mismatch. The projector now preserves seat insets. Corridors no longer collapse after measurement.
- **Preview ownership:** reorder cleanup cleared the insertion clock's shared motion flag. It now clears only its own settling flag. Insertion previews also retain the saved lane's boundary corridor instead of letting an unrole'd placeholder take it away; this removed a separate seven-screen-pixel boundary shift.
- **Section lock:** a render-time ref was reset by a post-render effect. The opening section now derives from each path's default insertion order, including the above-divider hint, without a mutable lock.
- **Missing bounds:** when an internal line did not exist yet, the role filter excluded Support, preventing its first lane from being created. Absent lines now combine the role bands between the visible bounds.
- **Standards:** the handed-off rail introduced a sub-floor text size, uppercase labels, half-step padding, raw motion fallbacks and a stale fill-mark exemption. These were corrected; the new section helper and this handoff now carry their required documentation metadata. Two handed-off TypeScript errors were also corrected.
- **Live create check:** the top band shows Top of the board / Line of interaction and its three roles; the frontstage band shows Line of interaction / Line of visibility and its two roles. A disposable fixture with an internal boundary shows Line of internal interaction / Bottom of the board and Support only. Fixture roles were restored after verification.
- **Toast check:** in a 1413px viewport, the notice and control bar share centre 850.5px with the 288px sidebar, and 706.5px collapsed.
- **Drop proof:** the new local authoring walk records Journey figures, frontstage and step drops, samples 40 consecutive paint frames, compares them to the saved layout, and restores each order through its own Undo. Before: 76px lane and 97px step excursions. After the settle and routing fixes: all six cases (three moves in each theme) pass with zero variation and their own Undo.

- **Final native check:** lane and step drops and Undo at measured 99% zoom in light and dark; Merged withholds reorder in both themes. Top and frontstage create rails were rechecked with their filtered role lists. The branch and approved prototype remain open beside each other.
- **Checks:** forced TypeScript, 4,751 tests in 429 files, lint, build and the requested source/database/documentation gates pass. The fresh paired authoring walks retain the shared Name-autofocus and intermediate-frame-count failures; their thresholds were not reduced. Full per-case results and declined baseline failures are in the PR report.
