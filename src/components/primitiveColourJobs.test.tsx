// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { InputGroup } from '@/components/ui/input-group'
import { Switch } from '@/components/ui/switch'
import { toggleVariants } from '@/components/ui/toggle'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { badgeVariants } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { CardDescription } from '@/components/ui/card'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/*
 * WHICH COLOUR JOB each shared primitive applies — the class, not the hex.
 *
 * The hex is the wrong assertion here and would be worse than none. The mix
 * dials in this system already match the design system these primitives were
 * ported from, so a contrast or colour-value check passes both before and
 * after the bug: an empty field whose placeholder sat on CAPTION grey resolved
 * to a perfectly good colour, it was simply the colour of text somebody had
 * typed. What was wrong was the job. So each assertion below names the job.
 *
 * Deliberately not a snapshot of the whole class string. These files carry
 * geometry, timings, focus and invalid states that change for their own
 * reasons; pinning all of it would fail on every unrelated edit and teach the
 * next person to re-record rather than read. Only the tokens that encode a
 * decision are pinned, plus the raw values that decision replaced.
 */

afterEach(cleanup)

/**
 * An UNPREFIXED utility — the resting state. `file:bg-transparent` and
 * `disabled:bg-transparent` are variants on other states and are none of this
 * test's business; a bare `bg-transparent` is the plate the control sits on.
 */
function hasResting(classes: string, utility: string): boolean {
  return classes.split(/\s+/).includes(utility)
}

/**
 * Read off the DOCUMENT, not the render container: the floating primitives
 * portal out of it, and a container-scoped query silently finds nothing.
 */
function classesOf(slot: string, ui: React.ReactElement): string {
  render(ui)
  const node = document.querySelector(`[data-slot="${slot}"]`)
  if (!node) throw new Error(`no [data-slot="${slot}"] rendered`)
  return node.className
}

describe('an empty field looks empty', () => {
  it('gives Input a hint-grey placeholder, never caption grey', () => {
    const classes = classesOf('input', <Input placeholder="Add a note" />)
    expect(classes).toContain('placeholder:text-tertiary-foreground')
    expect(classes).not.toContain('placeholder:text-muted-foreground')
  })

  it('gives Textarea the same hint grey', () => {
    const classes = classesOf('textarea', <Textarea placeholder="Add a note" />)
    expect(classes).toContain('placeholder:text-tertiary-foreground')
    expect(classes).not.toContain('placeholder:text-muted-foreground')
  })

  it('sits Input and Textarea on the sunk field plate', () => {
    // `bg-transparent` is the resting fill this replaced: a field that borrows
    // the page colour reads as a label rather than a place to type.
    const input = classesOf('input', <Input />)
    expect(hasResting(input, 'bg-field')).toBe(true)
    expect(hasResting(input, 'bg-transparent')).toBe(false)
    expect(input).not.toContain('dark:bg-input/30')
    const textarea = classesOf('textarea', <Textarea />)
    expect(hasResting(textarea, 'bg-field')).toBe(true)
    expect(hasResting(textarea, 'bg-transparent')).toBe(false)
    expect(textarea).not.toContain('dark:bg-input/30')
  })

  it('sits a grouped input on that same plate, so the group is one control', () => {
    const classes = classesOf('input-group', <InputGroup />)
    expect(classes).toContain('bg-field')
    expect(classes).not.toContain('dark:bg-input/30')
  })
})

describe('a group dims for what is disabled', () => {
  const tokens = (classes: string) => classes.split(/\s+/)

  it('dims for any disabled descendant by default, as the vendored group does', () => {
    const classes = tokens(classesOf('input-group', <InputGroup />))
    expect(classes).toContain('has-disabled:opacity-50')
    expect(classes).toContain('has-disabled:bg-input/50')
  })

  it('dims only for its own disabled control when scoped to it', () => {
    // A group whose add-on disables itself on its own — a send with nothing
    // to send — is not unavailable, so the look follows the control alone.
    const classes = tokens(
      classesOf('input-group', <InputGroup disabledScope="control" />),
    )
    expect(classes.filter((name) => name.includes('has-disabled:'))).toEqual([])
    expect(classes).toContain('has-[[data-slot=input-group-control]:disabled]:opacity-50')
    expect(classes).toContain('has-[[data-slot=input-group-control]:disabled]:bg-input/50')
    expect(classes).toContain('dark:has-[[data-slot=input-group-control]:disabled]:bg-input/80')
  })
})

describe('a locked value looks like a caption', () => {
  it('reads a read-only Input as caption ink on the ordinary border', () => {
    const classes = classesOf('input', <Input readOnly value="Live" />)
    expect(classes).toContain('read-only:text-muted-foreground')
    expect(classes).toContain('read-only:border-border')
  })

  it('locks a read-only Textarea the same way, since it invites typing most', () => {
    // A read-only textarea used to be byte-identical to an editable one, so
    // the largest invitation to type was the one control that never said it
    // was locked.
    const classes = classesOf('textarea', <Textarea readOnly value="Live" />)
    expect(classes).toContain('read-only:text-muted-foreground')
    expect(classes).toContain('read-only:border-border')
  })

  it('does not let the locked look fire on a disabled field', () => {
    // CSS `:read-only` matches a DISABLED input too, so an ungated
    // `read-only:` put the locked look on top of the fade — a disabled field
    // reading as a caption on an ordinary border, which is not what disabled
    // means here. Both controls gate it on `enabled:`.
    for (const classes of [
      classesOf('input', <Input disabled />),
      classesOf('textarea', <Textarea disabled />),
    ]) {
      expect(classes).toContain('enabled:read-only:text-muted-foreground')
      expect(classes).not.toMatch(/(?<!enabled:)read-only:text-muted-foreground/)
    }
  })

  it('still fades the whole control when disabled, on both controls', () => {
    // Not upstream's Input-only "disabled ink is tertiary": their own textarea
    // fades the plate, and two controls must not disagree about disabled. The
    // assertion covers both, or it passes while they disagree.
    expect(classesOf('input', <Input disabled />)).toContain('disabled:opacity-50')
    cleanup()
    expect(classesOf('textarea', <Textarea disabled />)).toContain('disabled:opacity-50')
  })
})

describe('a chooser looks raised', () => {
  it('sits the select trigger on the raised control plate, with a hover edge', () => {
    const classes = classesOf(
      'select-trigger',
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>,
    )
    expect(hasResting(classes, 'bg-control-raised')).toBe(true)
    expect(hasResting(classes, 'bg-transparent')).toBe(false)
    expect(classes).not.toContain('dark:bg-input/30')
    expect(classes).toContain('hover:border-control-hover')
  })

  it('restores full ink on the chosen row, so the check is not the only mark', () => {
    // The rows are caption grey so the chosen one stands out; without this the
    // selected row was the same ink as the rest and only the glyph said so.
    // `data-selected` is Base UI's own attribute for the selected item.
    const classes = classesOf(
      'select-item',
      <Select open defaultValue="a">
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(classes).toContain('text-muted-foreground')
    expect(classes).toContain('data-selected:text-foreground')
  })

  it('gives an unchosen select the same hint grey as an empty field', () => {
    const classes = classesOf(
      'select-trigger',
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>,
    )
    expect(classes).toContain('data-placeholder:text-tertiary-foreground')
    expect(classes).not.toContain('data-placeholder:text-muted-foreground')
  })
})

describe('a switch uses named colours', () => {
  it('washes the off track with a control colour, not raw black or white', () => {
    // Raw black and white are a hole punched through the page: they ignore the
    // theme's own surface ramp and move independently of everything near them.
    const classes = classesOf('switch', <Switch />)
    expect(classes).toContain('bg-control-raised')
    expect(classes).not.toContain('bg-black/')
    expect(classes).not.toContain('dark:bg-white/')
  })

  it('keeps the filled-control colour when on', () => {
    expect(classesOf('switch', <Switch />)).toContain('data-checked:bg-brand')
  })

  it('gives the off track an edge, since the wash alone is nearly the page', () => {
    // Measured, not assumed: `--control-raised` is about a 2% white wash, and
    // against a 0.995-lightness page that is very nearly the page itself. The
    // named wash was applied as specified and left no visible track.
    const classes = classesOf('switch', <Switch />)
    expect(classes).toContain('border-border')
    expect(classes).toContain('data-checked:border-transparent')
  })

  it('gives the thumb a named hairline', () => {
    const classes = classesOf('switch-thumb', <Switch />)
    expect(classes).toContain('ring-border')
    expect(classes).not.toContain('ring-black/')
  })
})

describe('a chosen control is not the quiet one', () => {
  it('restores ink on a pressed toggle, so hover cannot outrank it', () => {
    // The resting toggle is caption grey and hover restores ink. Without ink
    // on the ON state, pointing at an UNPRESSED neighbour made it look more
    // chosen than the pressed one.
    const classes = toggleVariants({ variant: 'default' })
    expect(classes).toContain('text-muted-foreground')
    expect(classes).toContain('aria-pressed:text-foreground')
    expect(classes).toContain('data-[state=on]:text-foreground')
  })
})

describe('floating chrome sits on the page', () => {
  it('seats a tooltip on the page, not on an inverted slab', async () => {
    const classes = classesOf(
      'tooltip-content',
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>trigger</TooltipTrigger>
          <TooltipContent>What this does</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )
    expect(hasResting(classes, 'bg-background')).toBe(true)
    expect(hasResting(classes, 'text-foreground')).toBe(true)
    // The inverted pair this replaced: a slab of ink with contrast text reads
    // as a different surface from everything else that floats.
    expect(hasResting(classes, 'bg-foreground')).toBe(false)
    expect(hasResting(classes, 'text-contrast')).toBe(false)
    // Page-coloured on a page needs its own edge, or it has none at all.
    expect(classes).toContain('ring-border-overlay')
  })

  it('gives a sheet a named edge, since its scrim is the page colour', () => {
    // The overlay is `bg-background/90`, and in the light theme the popover
    // plate computes to within ~0.005 lightness of it — so panel and scrim are
    // one field of white unless the hairline is a colour somebody chose.
    const classes = classesOf(
      'sheet-content',
      <Sheet open>
        <SheetContent>content</SheetContent>
      </Sheet>,
    )
    expect(classes).toContain('border-border-overlay')
    expect(classesOf('sheet-overlay', <Sheet open><SheetContent>c</SheetContent></Sheet>)).toContain(
      'bg-background/90',
    )
  })

  it('seats a dialog on the page surface, not the card plate', () => {
    const classes = classesOf(
      'dialog-content',
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    expect(hasResting(classes, 'bg-background')).toBe(true)
    expect(hasResting(classes, 'bg-card')).toBe(false)
  })
})

describe('badges and buttons pick the same jobs', () => {
  it('makes the default badge a quiet tag', () => {
    const classes = badgeVariants({ variant: 'default' })
    expect(classes).toContain('bg-card')
    expect(classes).toContain('text-muted-foreground')
    expect(classes).toContain('border-input')
    expect(hasResting(classes, 'bg-primary')).toBe(false)
  })

  it('keeps an outline button page-coloured in dark as well as light', () => {
    // The dark-mode wash this dropped made an outline button read as a filled
    // one at night: the variant changed meaning with the lights.
    const classes = buttonVariants({ variant: 'outline' })
    expect(hasResting(classes, 'bg-background')).toBe(true)
    expect(classes).not.toContain('dark:bg-input/30')
    expect(classes).not.toContain('dark:hover:bg-input/50')
  })

  it('lifts a ghost button on hover with the accent, not the resting elevation', () => {
    const classes = buttonVariants({ variant: 'ghost' })
    expect(classes).toContain('hover:bg-accent')
    expect(classes).not.toContain('hover:bg-muted')
  })

  it('fills a destructive button solid', () => {
    // A 10% tint reads as a badge describing a risk rather than a button that
    // performs one.
    const classes = buttonVariants({ variant: 'destructive' })
    expect(hasResting(classes, 'bg-destructive')).toBe(true)
    expect(hasResting(classes, 'text-destructive-foreground')).toBe(true)
    expect(classes).not.toContain('bg-destructive/10')
  })
})

describe('quiet chrome recedes one rung past captions', () => {
  it('drops dialog and card descriptions to hint grey', () => {
    const dialog = classesOf(
      'dialog-description',
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>What this asks for</DialogDescription>
        </DialogContent>
      </Dialog>,
    )
    expect(dialog).toContain('text-tertiary-foreground')
    cleanup()
    const card = classesOf('card-description', <CardDescription>Sub</CardDescription>)
    expect(card).toContain('text-tertiary-foreground')
  })

  it('quiets an inactive tab with one job, not an opacity in light and a token in dark', () => {
    // `text-foreground/60` paired with a dark-mode override meant the same
    // rung was spelled two ways and could drift between themes.
    const classes = classesOf(
      'tabs-trigger',
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    )
    expect(classes).toContain('text-tertiary-foreground')
    expect(classes).not.toContain('text-foreground/60')
    expect(classes).not.toContain('dark:text-muted-foreground')
  })

  it('keeps the breadcrumb trail readable while its links recede', () => {
    render(
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Workspace</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>This page</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>,
    )
    const link = document.querySelector('[data-slot="breadcrumb-link"]')
    const separator = document.querySelector('[data-slot="breadcrumb-separator"]')
    const list = document.querySelector('[data-slot="breadcrumb-list"]')
    const page = document.querySelector('[data-slot="breadcrumb-page"]')
    expect(link?.className).toContain('text-tertiary-foreground')
    expect(separator?.className).toContain('text-tertiary-foreground')
    // The trail and the page you are on are NOT chrome: one is the caption
    // that has to be readable, the other is where you are.
    expect(list?.className).toContain('text-muted-foreground')
    expect(page?.className).toContain('text-foreground')
  })
})
