/** The grip appears with the whole-axis highlight; the header remains the drag target. */
export function StructureDragGrip() {
  return (
    <svg
      data-structure-grip=""
      aria-hidden
      viewBox="0 0 12 16"
      className="pointer-events-none absolute left-1 top-1/2 h-4 w-3 -translate-y-1/2 text-text-primary"
    >
      {[4, 8, 12].flatMap((y) =>
        [4, 8].map((x) => (
          <circle key={`${x}:${y}`} cx={x} cy={y} r="1" fill="currentColor" />
        )),
      )}
    </svg>
  )
}
