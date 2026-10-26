/** The draft uses one clock for its row/column and the balancing panel offset. */
export function structureDraftExtent(size: number) {
  return `calc(var(--structure-draft-from, 36px) + var(--structure-draft-progress, 1) * (${size}px - var(--structure-draft-from, 36px)))`
}
