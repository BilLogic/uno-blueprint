import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { StakeholderBadge } from '@/components/blueprint/StakeholderBadge'
import {
  STAKEHOLDER_KIND_LABELS,
  useStakeholders,
  type StakeholderKind,
} from '@/hooks/useStakeholders'
import { cn } from '@/lib/utils'

/**
 * Which member of the cast this lane is.
 *
 * Read-only over the registry on purpose: the cast changes about once a
 * quarter, and creating or renaming one is an agent tool with a ledger entry,
 * not something to do by typing into a lane. Most lanes have nobody — the
 * structural rows (tech, support, storyboard) are scaffolding — so "Nobody" is
 * a first-class choice rather than an empty state.
 */
export function StakeholderSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: string | null
  onChange: (next: string | null) => void
  disabled?: boolean
}) {
  const result = useStakeholders()
  const stakeholders = result.status === 'ready' ? result.data : []
  const [open, setOpen] = useState(false)
  const selected = stakeholders.find((entry) => entry.id === value) ?? null

  /*
    Read-only is the OWNER BADGE, not the prose it used to be.

    The name alone left a reader knowing WHICH party owns the lane and with
    no way to find out who that party is. The registry holds a one-line
    definition of every one of them — `stakeholders.summary` — and hanging it
    on the badge is the mechanism this panel family uses for exactly this: a
    value from a governed vocabulary the reader learns by seeing it repeat,
    whose meaning belongs on its own hover.

    The kind stays beside the badge as text rather than joining it: a badge
    says one thing, and "Blueprint owner" and "Staff" are two.
  */
  if (disabled) {
    /*
      "Nobody" is an ASSERTION, and only a successful read can make it.

      The registry is a second query that starts after the lane's own resolves,
      so there is always a window in which `stakeholders` is `[]` because it has
      not arrived — not because the lane has no actor. Collapsing loading and
      error into the empty list made the first render of EVERY lane say "Nobody
      — a structural row.", including the lanes that name one, and a failed read
      left that sentence standing permanently. Both are the panel stating a fact
      about the service that it does not know.
    */
    if (result.status === 'loading') {
      return <p className="text-xs font-normal text-muted-foreground">Loading the cast…</p>
    }
    if (result.status === 'error') {
      return (
        <p className="text-xs font-normal text-muted-foreground">
          The cast could not be loaded: {result.message}
        </p>
      )
    }
    if (!selected) {
      // A read that succeeded, and a lane with no `stakeholder_id`: now the
      // sentence is true. (A dangling id — a row deleted underneath the lane —
      // reads the same way, which is the one case this cannot distinguish and
      // the one where "nobody owns this" is also the honest answer.)
      return (
        <p className="text-sm font-normal text-foreground">
          <span className="text-muted-foreground">Nobody — a structural row.</span>
        </p>
      )
    }
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StakeholderBadge
          name={selected.name}
          kind={selected.kind as StakeholderKind}
          summary={selected.summary}
        />
        <span className="text-xs font-normal text-muted-foreground">
          {STAKEHOLDER_KIND_LABELS[selected.kind as StakeholderKind]}
        </span>
      </div>
    )
  }

  const pick = (next: string | null) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-between px-2 font-normal"
            >
              <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                {selected ? selected.name : 'Nobody'}
              </span>
              <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
            </Button>
          }
        />
        <PopoverContent align="start" className="w-56 gap-1 p-1">
          {/* "None", not the sentence that used to sit here — the hint slot is
              `shrink-0` and holds one word ("Staff", "Partner"), so a sentence
              pushed the popover wider than its own `w-56` and bled out of it.
              What a structural row is belongs on the field's own hint, which
              already says it. */}
          <StakeholderRow
            label="Nobody"
            hint="None"
            selected={value === null}
            onSelect={() => pick(null)}
          />
          {stakeholders
            /*
              Teams are in the same registry — one table for every party — but a
              stakeholder is who appears in the blueprint as an ACTOR, and Design
              does not stand in a room. Teams reach a lane through `owner_team`.
            */
            .filter((entry) => entry.kind !== 'team')
            .map((entry) => (
            <StakeholderRow
              key={entry.id}
              label={entry.name}
              hint={STAKEHOLDER_KIND_LABELS[entry.kind as StakeholderKind]}
              selected={entry.id === value}
              onSelect={() => pick(entry.id)}
            />
          ))}
        </PopoverContent>
      </Popover>
      {/*
        The same definition the badge carries, spelled out rather than hovered.

        Design mode has no badge to hover — the value is a picker, and its
        label is the name — so the definition would otherwise be the one thing
        an author cannot see at the moment they are choosing who owns the row.
        The two never appear together, which is what keeps this from being a
        second mechanism for one fact.
      */}
      {selected?.summary ? (
        <p className="text-xs text-muted-foreground">
          {selected.summary}
        </p>
      ) : null}
    </>
  )
}

function StakeholderRow({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs',
        'transition-colors ease-arrive motion-reduce:transition-none duration-(--motion-micro) hover:bg-accent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      )}
    >
      <Check
        className={cn('size-3 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">
        {hint}
      </span>
    </button>
  )
}
