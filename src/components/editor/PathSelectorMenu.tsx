import { Check, ChevronDown } from 'lucide-react'
import { Eyebrow } from '@/components/blueprint/Eyebrow'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { usePathSelectionContext } from '@/hooks/usePathSelection'
import { getPathColor } from '@/lib/pathColorTheme'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { cn } from '@/lib/utils'
import type { PathOption } from '@/components/blueprint/PathMultiSelect'
import { EntityDefinitionPopover } from '@/components/blueprint/EntityDefinitionPopover'
import { StatusBadge } from '@/components/blueprint/StatusBadge'
import { ENTITY_HEADER_HOLD_KEY } from '@/components/blueprint/EntityHeader'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { useShellBooting } from '@/contexts/shellBootStore'

/**
 * The top-bar path control: desktop reads and COMPARES paths, so this is a
 * multi-select over the same PathSelectionContext the sidebar checklist
 * used — only the mount moved.
 * The trigger is deliberately compact: overlapping path-color dots plus a
 * count, never the full names; a single selection may show its (truncated)
 * name.
 * It is a PLAIN bordered control on the md rung. It carried a second,
 * brand-coloured dot after the label, which said what the label already said
 * and said it in a colour the path dots on its left do not use — two dot
 * vocabularies in one control. The brand hue's fourth job moved inside, onto
 * the mark on a selected row, where it marks a choice instead of restating
 * one.
 */
export function PathSelectorMenu({ options }: { options: PathOption[] }) {
  const { activePathKeys, togglePathKey } = usePathSelectionContext()
  // The shell's boot layer. The control has no loading of its own — its
  // options arrive with the board — so left alone it painted the moment they
  // landed, beside a sidebar and an identity bar still in skeleton. It keeps
  // the bar's beat by sharing the bar's hold session.
  const shellBooting = useShellBooting()
  // Nothing to show and nothing coming: no wrapper either, so the bar's gap
  // has no phantom child.
  if (!shellBooting && options.length === 0) return null

  const selected = options.filter((option) =>
    activePathKeys.includes(option.id),
  )
  const dots = (selected.length > 0 ? selected : options).slice(0, 3)

  return (
    <DeferredSkeleton
      loading={shellBooting}
      holdKey={ENTITY_HEADER_HOLD_KEY}
      skeleton={
        <Skeleton
          data-path-selector-skeleton=""
          className="h-7 w-16 rounded-md"
        />
      }
    >
      {options.length === 0 ? null : (
        <Popover>
          {/* Its face is dots and a count: the tooltip says what the control
              does; the aria-label keeps the name. */}
          <IconTooltip label="Choose which paths are shown">
            <PopoverTrigger
              render={
                <button
                  type="button"
                  aria-label={`Paths shown: ${
                    selected.length > 0
                      ? selected.map((option) => option.name).join(', ')
                      : 'none'
                  }`}
                  className={cn(
                    'pointer-events-auto flex h-7 items-center gap-2 rounded-md border border-border bg-card',
                    'px-2 text-sm text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground',
                  )}
                >
                  <span className="flex items-center" aria-hidden>
                    {dots.map((option, index) => (
                      <span
                        key={option.id}
                        data-path-selector-dot=""
                        className={cn(
                          'size-2 rounded-full',
                          // The ring is what keeps two overlapping dots two
                          // dots; one dot has nothing to separate itself from
                          // and wears a hairline of the plate for nothing.
                          index > 0 && '-ml-1 ring-1 ring-card',
                        )}
                        style={{ backgroundColor: getPathColor(option) }}
                      />
                    ))}
                  </span>
                  <span
                    data-path-selector-label=""
                    className="max-w-[10rem] truncate"
                  >
                    {selected.length === 1
                      ? selected[0].name
                      : `${selected.length} paths`}
                  </span>
                  <ChevronDown className="size-3 shrink-0" aria-hidden />
                </button>
              }
            />
          </IconTooltip>
          <PopoverContent align="end" className="w-72 p-2">
            {/* What a PATH is, where the reader picks one. The in-grid
                path badge already carries this definition; the selector is the
                other place a reader meets paths, so it heads the list with the
                same word and the same explanation, reachable on hover, focus
                and tap. */}
            <EntityDefinitionPopover kind="path" side="left">
              <Eyebrow className="flex w-fit px-2 pb-1 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                Path
              </Eyebrow>
            </EntityDefinitionPopover>
            <ul className="flex flex-col gap-1">
              {options.map((option) => {
                const checked = activePathKeys.includes(option.id)
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      aria-pressed={checked}
                      onClick={() => togglePathKey(option.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none',
                        'hover:bg-accent',
                        checked
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {/* The same 8px dot the trigger draws. One control, one
                          dot size: a row that showed a larger dot than the
                          trigger it fills made the two read as two marks. */}
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: getPathColor(option) }}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                      </span>
                      {/* Dot, name, status — the same three the scenario
                          panel shows, in the same order. Text in this row's
                          one control, not a second control inside it. */}
                      <StatusBadge status={option.status} definition={false} />
                      {/* The brand hue's fourth job. A row's mark is the one
                          place in this control where the identity colour says
                          which path the reader chose; the dots beside it are
                          path colours and cannot carry that. */}
                      <Check
                        data-path-selector-mark=""
                        className={cn(
                          'size-3.5 shrink-0 text-brand',
                          !checked && 'invisible',
                        )}
                        aria-hidden
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </DeferredSkeleton>
  )
}
