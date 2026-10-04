import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Home,
  Layers,
  Maximize2,
  Search,
  SquareDashed,
  SunMoon,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useCanvasZoomChrome } from '@/contexts/CanvasZoomChromeContext'
import { useEditor } from '@/contexts/EditorContext'
import { useCanvasBlueprints } from '@/hooks/useCanvasBlueprints'
import { requestScenarioCellFocus } from '@/lib/canvasFocusCells'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import {
  getMainSlides,
  getSlideDisplayLabel,
  getSubslides,
  isSubslide,
} from '@/types/nav'

const NO_SCENARIOS: string[] = []

/**
 * The vendored command group sets its heading in mono capitals with wide
 * tracking. A group heading here is a small label like any other — sans,
 * sentence case as written, letter-spacing 0 — so the wrapper restates those
 * three and leaves the primitive as the component CLI shipped it.
 */
const GROUP_HEADING_CLASS =
  '**:[[cmdk-group-heading]]:font-sans **:[[cmdk-group-heading]]:normal-case **:[[cmdk-group-heading]]:tracking-normal'

/**
 * Whether the element taking keystrokes is somewhere a character belongs.
 *
 * @param element - Usually `document.activeElement`.
 * @returns True when a chord would eat the reader's typing.
 */
function isTextEntry(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false
  if (element.isContentEditable) return true
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA'
}

/**
 * Top-nav Jump to… field. Desktop widths show the labelled field with a ⌘K
 * hint; below `md` it collapses to an icon. ⌘K and Ctrl+K open the same
 * command dialog.
 */
export function JumpToSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Cells are a query per scenario, so they wait for a reason to exist: the
  // reader's first keystroke. Latched rather than read off `query`, so
  // clearing the field does not throw the fetched rows away.
  const [cellsWanted, setCellsWanted] = useState(false)

  /**
   * The one open-state writer. Every open and every close starts the palette
   * on an empty query, which is what "opens fresh" means and what the
   * reader who just closed it expects to find next time.
   *
   * @param next - Whether the palette should be showing, or a toggle of it.
   */
  const setPaletteOpen = useCallback(
    (next: boolean | ((current: boolean) => boolean)) => {
      setOpen(next)
      setQuery('')
      setCellsWanted(false)
    },
    [],
  )

  /**
   * Take a keystroke into the field, and let the cells in behind it.
   *
   * @param value - The field's new contents.
   */
  const onQueryChange = useCallback((value: string) => {
    setQuery(value)
    if (value.length > 0) setCellsWanted(true)
  }, [])

  useEffect(() => {
    /**
     * Opens the palette. Ignores the chord while the reader is composing
     * (IME) so a dead key does not steal the dialog, and while a text field
     * has focus so the shortcut never eats a character someone is typing.
     *
     * @param event - Window keydown.
     */
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return
      }
      if (isTextEntry(document.activeElement)) return
      event.preventDefault()
      setPaletteOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setPaletteOpen])

  return (
    <>
      <button
        type="button"
        data-jump-to=""
        aria-label="Jump to…"
        onClick={() => setPaletteOpen(true)}
        className={cn(
          'hidden h-7 min-w-40 items-center gap-2 rounded-md border border-border bg-field px-2 text-sm text-muted-foreground',
          'hover:text-foreground md:flex',
        )}
      >
        <Search className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-left">Jump to…</span>
        <kbd className="rounded-md border border-border px-1 font-sans text-xs text-tertiary-foreground">
          ⌘K
        </kbd>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Jump to…"
        onClick={() => setPaletteOpen(true)}
        className="text-muted-foreground hover:text-foreground md:hidden"
      >
        <Search className="size-3.5" aria-hidden />
      </Button>
      {/* Mounted through close, so the dialog's exit transition has
          something to play on. */}
      <JumpToDialog
        open={open}
        onOpenChange={setPaletteOpen}
        query={query}
        onQueryChange={onQueryChange}
        cellsWanted={cellsWanted}
      />
    </>
  )
}

/**
 * Command dialog for Jump to… — scenarios, cells, and a short action list.
 *
 * @param open - Whether the dialog is showing.
 * @param onOpenChange - Dialog open-state writer.
 * @param query - The search field's contents.
 * @param onQueryChange - Search-field writer.
 * @param cellsWanted - Whether the reader has typed at least once this open.
 */
function JumpToDialog({
  open,
  onOpenChange,
  query,
  onQueryChange,
  cellsWanted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  cellsWanted: boolean
}) {
  const { slides, openScenario, goLanding } = useEditor()

  const scenarioIds = useMemo(
    () =>
      open && cellsWanted
        ? slides.filter((slide) => isSubslide(slide)).map((slide) => slide.id)
        : NO_SCENARIOS,
    [open, cellsWanted, slides],
  )
  const { blueprintsByScenario } = useCanvasBlueprints(scenarioIds)
  const zoom = useCanvasZoomChrome()
  const { toggleTheme } = useTheme()

  const scenarios = useMemo(() => {
    return getMainSlides(slides).flatMap((phase) =>
      getSubslides(phase.id, slides).map((scenario) => ({
        id: scenario.id,
        label: getSlideDisplayLabel(scenario, slides),
        badge: getSlideDisplayLabel(phase, slides),
      })),
    )
  }, [slides])

  const cells = useMemo(() => {
    const seen = new Set<string>()
    const rows: Array<{
      id: string
      scenarioId: string
      label: string
      badge: string
    }> = []
    for (const [scenarioId, blueprint] of blueprintsByScenario) {
      const scenario = slides.find((slide) => slide.id === scenarioId)
      if (!scenario) continue
      const phase = scenario.parentId
        ? slides.find((slide) => slide.id === scenario.parentId)
        : undefined
      for (const cell of blueprint.cells) {
        if (seen.has(cell.id)) continue
        seen.add(cell.id)
        const label = cell.content.split('\n')[0]?.trim() || 'Untitled cell'
        rows.push({
          id: cell.id,
          scenarioId,
          label,
          badge: [
            phase ? getSlideDisplayLabel(phase, slides) : null,
            getSlideDisplayLabel(scenario, slides),
          ]
            .filter(Boolean)
            .join(' › '),
        })
      }
    }
    return rows
  }, [blueprintsByScenario, slides])

  /**
   * Escape belongs to the query before it belongs to the dialog: the first
   * press empties the field, the next one closes. Taken on the window in
   * capture so the dialog's own dismissal never sees a press meant for the
   * query.
   */
  const onEscape = useCallback(
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (query.length > 0) onQueryChange('')
      else onOpenChange(false)
    },
    [query, onQueryChange, onOpenChange],
  )

  useEffect(() => {
    if (!open) return
    window.addEventListener('keydown', onEscape, true)
    return () => window.removeEventListener('keydown', onEscape, true)
  }, [open, onEscape])

  /**
   * Close the palette after an action.
   *
   * @param run - The action to run.
   */
  function runAndClose(run: () => void) {
    run()
    onOpenChange(false)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump to…"
      description="Search scenarios, cells, and actions"
    >
      <Command>
        <CommandInput
          placeholder="Jump to…"
          value={query}
          onValueChange={onQueryChange}
        />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup className={GROUP_HEADING_CLASS} heading="Scenarios">
            {scenarios.map((scenario) => (
              <CommandItem
                key={scenario.id}
                value={`${scenario.label} ${scenario.badge}`}
                onSelect={() =>
                  runAndClose(() =>
                    openScenario(scenario.id, { closeNav: true }),
                  )
                }
              >
                <JumpToRow
                  icon={Layers}
                  label={scenario.label}
                  badge={scenario.badge}
                />
              </CommandItem>
            ))}
          </CommandGroup>
          {/* No query, no Cells group — not even its heading. A heading over
              nothing is what this group drew before the reader typed. */}
          {query.length > 0 && cells.length > 0 ? (
            <CommandGroup className={GROUP_HEADING_CLASS} heading="Cells">
              {cells.map((cell) => (
                <CommandItem
                  key={cell.id}
                  value={`${cell.label} ${cell.badge}`}
                  onSelect={() =>
                    runAndClose(() => {
                      openScenario(cell.scenarioId, { closeNav: true })
                      requestScenarioCellFocus(cell.scenarioId, cell.id, {
                        openDetail: true,
                      })
                    })
                  }
                >
                  <JumpToRow
                    icon={SquareDashed}
                    label={cell.label}
                    badge={cell.badge}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup className={GROUP_HEADING_CLASS} heading="Actions">
            <CommandItem
              value="Fit scenario to view"
              onSelect={() =>
                runAndClose(() => {
                  zoom?.chrome?.fitToView?.({ animate: true })
                })
              }
            >
              <JumpToRow
                icon={Maximize2}
                label="Fit scenario to view"
                badge="Canvas"
              />
            </CommandItem>
            <CommandItem
              value="Switch theme"
              onSelect={() =>
                runAndClose(toggleTheme)
              }
            >
              <JumpToRow
                icon={SunMoon}
                label="Switch theme"
                badge="Appearance"
              />
            </CommandItem>
            <CommandItem
              value="Open cover"
              onSelect={() => runAndClose(() => goLanding())}
            >
              <JumpToRow icon={Home} label="Open cover" badge="Workspace" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

/**
 * One palette row: an icon for the kind, a truncating name, and a badge that
 * keeps its place whatever the name does.
 *
 * @param icon - Mark for the kind of thing this row opens.
 * @param label - Primary name.
 * @param badge - Where the thing lives, on the right.
 */
function JumpToRow({
  icon: Icon,
  label,
  badge,
}: {
  icon: LucideIcon
  label: string
  badge: string
}) {
  return (
    <>
      <Icon className="size-5 stroke-1 text-tertiary-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={label}>
        {label}
      </span>
      <span className="shrink-0 text-xs text-tertiary-foreground">{badge}</span>
    </>
  )
}
