import { useEffect, useRef, useState } from 'react'
import { Diamond, X } from 'lucide-react'
import { registerAgentUiCommand } from '@/lib/agent/uiCommands'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CreateSliceSheet } from '@/components/editor/CreateSliceSheet'
import { SessionChangesSheet } from '@/components/editor/SessionChangesSheet'
import { useCellPick } from '@/contexts/cellPickContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { cn } from '@/lib/utils'

/** Module-level so an empty selection is the same array on every render. */
const NO_PICKS: readonly string[] = []

/**
 * The Edit tool run.
 *
 * Edit and View own separate tool runs — that is what makes them two modes
 * rather than one mode with a flag. View reads, navigates and marks up; Edit
 * authors. Annotation tools deliberately do not appear here: a pen active
 * while cells are selectable is a click with two meanings, and the mode switch
 * exists precisely so that question has one answer at a time.
 *
 * What used to be here and is not any more, each moved somewhere that knows
 * more than a global bar does:
 *
 * - **Edit cell** → gone. Picking one cell opens the panel, which is what
 *   clicking a cell always did.
 * - **New scenario** → the phase row's `+` in the sidebar, so the phase is
 *   chosen by the row rather than by a picker that can disagree with it.
 * - **New path** → the PATHS header's `+`, scoped to the selected scenario.
 * - **New step / lane / cell** → handles on the grid, because a position
 *   cannot be supplied by a menu.
 *
 * What stays is what acts on the *selection*, which has no home on the canvas:
 * making a slice from it, and clearing it.
 *
 * **Delete path** has now gone too, to the path's own row menu in the sidebar.
 * A destructive button sitting beside "Make slice" is a misclick waiting to
 * happen, and a global one also has to guess which path it means — a row
 * cannot be wrong about that.
 */
export function CanvasDesignTools() {
  const pick = useCellPick()
  const { isEditPreview } = useSupabase()

  /*
    Two pickers wear this bar, and they are different sentences.

    The base canvas gathers cells *toward* a slice (`gathers: true`), so its
    verb is "Make slice". A slice tab's edit session picks cells *into the
    highlighted screen* of a slice that already exists — offering "Make
    slice" there reads as an invitation to make a slice out of a slice,
    which is exactly the confusion it caused. That surface's own strip
    (screens, captions, storyboards) is the verb; the bar contributes only
    the shared chrome (save state, preview badge).
  */
  const gathering = pick?.gathers ?? false
  const picked = pick?.picked ?? NO_PICKS
  const [sliceDialogOpen, setSliceDialogOpen] = useState(false)
  const armed = pick?.plainClick ?? false
  const startPicking = pick?.startPicking

  // Agent parity: the Make-slice flow. With cells picked it opens the
  // sheet; with none it arms the button, exactly like a click.
  const pickedCountRef = useRef(picked.length)
  useEffect(() => {
    pickedCountRef.current = picked.length
  })
  useEffect(() => {
    if (!gathering) return
    return registerAgentUiCommand({
      name: 'open_make_slice',
      summary:
        'Open the Make slice sheet over the current Design-mode selection (select_cells first). Prefer create_slice when you already know the member cells — this hands the flow to the human.',
      run: () => {
        if (pickedCountRef.current === 0) {
          startPicking?.()
          return 'Nothing selected yet — gather cells first (select_cells), then retry.'
        }
        setSliceDialogOpen(true)
        return 'Make-slice sheet opened over the selection.'
      },
    })
  }, [gathering, startPicking])

  return (
    <>
      {/*
        The primary action of Edit mode, and the only one that acts on the
        selection — so it is a filled button rather than another ghost icon.
        It briefly lived floating above the picked cells, Figma-style, which
        does not survive contact with this grid: a selection can span lanes and
        steps anywhere on a very wide canvas, so a bar anchored to its bounding
        box lands somewhere unpredictable and often off-screen. A fixed home is
        worth more here than proximity.
      */}
      {gathering ? (
      <CreateSliceSheet
        cellIds={picked}
        open={sliceDialogOpen}
        onOpenChange={setSliceDialogOpen}
        onCreated={() => {
          pick?.clear()
          setSliceDialogOpen(false)
        }}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={
              picked.length === 0
                ? 'Make a slice — click cells to add them'
                : `Make a slice from ${picked.length} cells`
            }
            onClick={(event) => {
              // With nothing picked the button teaches instead of opening: a
              // sheet listing no cells answers a question nobody asked.
              if (picked.length === 0) {
                event.preventDefault()
                startPicking?.()
              }
            }}
            // Never a filled button. Nothing in this bar is a page's primary
            // action — it is a tool bar, and a solid brand button in it reads
            // as "press me" from the moment the canvas loads, long before
            // there is anything to press it about. Weight arrives with the
            // selection instead: ghost at rest, tinted and bordered once
            // cells are picked, which is also when it starts doing anything.
            className={cn(
              'pointer-events-auto shrink-0 gap-2 px-2',
              (armed || picked.length > 0)
                ? 'border border-primary/30 bg-primary/10 text-text-primary hover:bg-primary/15 hover:text-text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Diamond className="size-3.5" aria-hidden />
            {armed && picked.length === 0
              ? 'Click cells to add them'
              : 'Make slice'}
            {picked.length > 0 ? (
              <span className="rounded-full bg-primary/15 px-2 text-xs font-medium tabular-nums">
                {picked.length}
              </span>
            ) : null}
          </Button>
        }
      />
      ) : null}

      {/*
        Clearing lives beside the count because that is the question the count
        raises — "how do I start over" — and Escape is invisible.

        It is also now the *only* way to clear. Clicking empty canvas used to,
        and a selection gathered across several blueprints is far too expensive
        to lose to a miss between two cells. One deliberate target, aimed at.
      */}

      {gathering && (picked.length > 0 || armed) ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={armed && picked.length === 0 ? 'Cancel' : 'Clear the selection'}
                onClick={() => {
                  pick?.clear()
                }}
                className="pointer-events-auto size-7 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            }
          />
          <TooltipContent side="top" className="text-xs">
            Clear the selection (Esc)
          </TooltipContent>
        </Tooltip>
      ) : null}

      <SessionChangesSheet />

      {/*
        The preview state, said where the tools are. The sidebar badge was
        true but ignorable; three sessions in a row read "permission denied"
        as the app being broken. The place someone looks when a create does
        nothing is the bar they clicked from — so the answer lives there,
        amber, always on while it is true.
      */}
      {isEditPreview ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge
                variant="warning"
                className="pointer-events-auto gap-1"
              >
                {/* The role's solid fill, which is what a dot with no text
                    in it wants: the badge's own tint is behind it, and the
                    step this replaces was a ramp weight picked to be read as
                    ink rather than as a fill. 2.47:1 on the tint in light,
                    8.78:1 in dark — a mark, not a word. */}
                <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                preview — nothing saves
              </Badge>
            }
          />
          <TooltipContent side="top" className="max-w-64 text-xs">
            Edit preview shows the authoring UI without write access. Every
            create and edit will be refused by the database. To author for
            real: put the authoring key in .env.local (see .env.example),
            restart the dev server — or run `npm run authoring:check`.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </>
  )
}
