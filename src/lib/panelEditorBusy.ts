/**
 * True while any panel's editor has a save in flight, or while a dialog
 * opened from a panel is on screen. Every dismiss path (Escape, ✕-driven
 * close requests) checks this: closing mid-save reads as "cancelled", but
 * the write lands anyway — for a draft that means a cell materializing after
 * the panel that explained it is gone.
 *
 * The marker is `data-panel-editor`, not `data-cell-panel-editor`: the guard
 * has to cover the lane, phase and scenario editors too, and an attribute
 * naming one panel would have quietly guarded only that one.
 *
 * A dialog over a panel marks itself `data-panel-dialog`. Escape there belongs
 * to the dialog, and the panel listens for it on the window, where a key
 * pressed inside the dialog — or inside a list the dialog opened — arrives
 * all the same. Without the marker one key would close both, and the panel
 * would take its author's unsaved edits with it. The dialog keeps the marker
 * through its exit, so the press that closes it is still the dialog's.
 */
export function panelEditorBusy(): boolean {
  return (
    document.querySelector('[data-panel-editor][data-busy], [data-panel-dialog]') !== null
  )
}
