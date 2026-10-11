---
summary: Open views stay mounted while they are in the working set, so switching does not remount the canvas or replay revealStage — hidden trees are frozen, a cap bounds hidden slices, and the base canvas is kept only after this session has already built it.
---

# 10. Open views stay mounted

**Status** Accepted — 2026-09-09
**Context** the editor shell's content host, the tab view-state warm-set,
[ADR 0007](./0007-the-canvas-and-the-shell-run-on-separate-clocks.md)

The shell used to mount only the current view. Switching away unmounted the
canvas; coming back remounted it and restarted **revealStage**. Query **status**
was often already `ready`. The load was the screen, not the read. ADR 0007
split the shell's **entrance** from the canvas ladder *because* that remount
restarted the ladder; the two clocks remain. What changes is the remount.

**Decision.** Open views are **warm** or **cold**. A warm tree stays mounted
and frozen: no camera motion, no agent commands on that canvas; data may still
update. Return does not remount and does not replay reveal. A cold slice stays
in the strip; click remounts and reveal runs as on first open. Close drops the
tree.

The current view is always warm. The base canvas is warm only if this session
already mounted it — a slice-only visit does not build a hidden full canvas.
At most five other **slice** trees stay warm, by last activation. Present
views stay mounted and do not take a slice slot.

**This rejects** remounting on every switch (today's machine) and keeping
every open slice forever (unbounded duplicate boards). It also rejects
prefetching the base canvas behind a slice deep link.

Issue #410.
