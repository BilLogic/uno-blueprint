import { BLUEPRINT_MENUBAR_TITLE_TEXT_CLASS } from '@/components/editor/menubarHeaderLayout'
import { IconTooltip } from '@/components/editor/IconTooltip'
import {
  useEntityDetail,
  type EntityDetailKind,
} from '@/contexts/EntityDetailContext'
import { cn } from '@/lib/utils'

/**
 * The canvas title, and the way into what is behind it.
 *
 * The title and an ⓘ were ONE control once, with "View details" in their
 * shared hover slot, spending it on a sentence the glyph already said. The
 * block became two targets: the name, and an invisible opener filling
 * everything around it. The name is now only a name — what a service, a phase
 * or a scenario IS hangs off the kind badge beside it, which is where this app
 * puts a definition — so the block is back to one job, opening the panel.
 *
 * The opener IS the title text. An invisible full-block button painted BEHIND
 * the name captured nothing: the name's own layer sat above it, so a click on
 * the word — the natural target — was swallowed and never reached the button,
 * and all three title levels (service, phase, scenario) were dead at once
 * because they are this one component. Making the text itself the button puts
 * the click where the reader already aims it, and a native `<button>` carries
 * Enter/Space and focus for free. "View details" is the hover slot, spent on
 * what the plain word does not say — that it opens something.
 *
 * A TITLE, not a badge. The filled badge made the name of the thing you are
 * looking at read as a tag on something else, and the slice header band —
 * which is the same job on the same chrome layer — sets its title as plain
 * semibold text with the summary beneath it. One shape for one job.
 */
export function EntityTitleAffordance({
  kind,
  id,
  label,
  className,
}: {
  kind: EntityDetailKind
  id: string
  label: string
  className?: string
}) {
  const { toggleEntity, selection } = useEntityDetail()
  const open = selection?.kind === kind && selection.id === id

  return (
    <div
      data-entity-title=""
      data-open={open ? '' : undefined}
      className={cn(
        'group/entity-title relative flex min-w-0 items-center gap-2 rounded-md px-2 py-1',
        'transition-colors ease-arrive motion-reduce:transition-none duration-(--motion-micro)',
        'hover:bg-sidebar-accent data-open:bg-sidebar-accent',
        'has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring/50',
        className,
      )}
    >
      {/* The NAME, and it is the opener. Nothing hangs off it: what a service,
          a phase or a scenario IS belongs to the kind badge beside it, because
          a definition hangs off a badge and never off a label. A `<button>`
          rather than an `<h2>`, because this word is the control — the block
          behind it that used to be the button caught no clicks at all. */}
      <IconTooltip label="View details" side="bottom">
        <button
          type="button"
          // Says what it does, and which — several of these exist per screen.
          aria-label={`View details: ${label}`}
          aria-pressed={open}
          data-entity-title-affordance=""
          // `truncate`: the bar pins ONE title line. A long name that wrapped
          // made the row two lines tall inside a block held at one, and the
          // second line sat on the summary. The full name is the panel's
          // heading and the button's accessible name.
          className={cn(
            BLUEPRINT_MENUBAR_TITLE_TEXT_CLASS,
            'w-fit max-w-full cursor-pointer truncate rounded-md text-left outline-none',
          )}
          onClick={(event) => {
            event.stopPropagation()
            toggleEntity({ kind, id })
          }}
        >
          {label}
        </button>
      </IconTooltip>
    </div>
  )
}
