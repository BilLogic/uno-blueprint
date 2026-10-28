# Handoff: structure reorder settle + lane-create rail

**For:** Codex (or any agent picking up `codex/canvas-header-reorder`)  
**Branch:** `codex/canvas-header-reorder`  
**Tracker:** https://github.com/BilLogic/uno-blueprint/issues/1238  
**Author context:** Cursor session landed section-scoped new-lane create + several settle attempts; the **post-drop flash is still live**. Do not mark the glitch fixed without a recorded drop on the sample board.

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
