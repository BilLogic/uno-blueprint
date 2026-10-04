import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * DIVERGENCE from the vendored source, allowed only with a stated reason.
 * Radius on the visual-system ladder (md); brand is its own variant so the
 * identity fill does not paint every default Button — a filled control keeps
 * the primary contrast floor; brand is for the four identity jobs only.
 */

const buttonVariants = cva(
  // Weight 400, not 500. Supabase's Button base is `font-regular`, and a
  // filled brand button at 500 is what read as "too bold" — the label was
  // heavier than the body copy around it for no reason the control needed.
  // Weight is now free to mean one thing here: SELECTED (see `ghost` below).
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-normal whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Supabase's button treatment: a flat `--primary` fill, one
        // shade-darker 1px edge, tighter radius, no drop shadow — the border
        // carries the weight the muted fill gave up. The fill is whatever the
        // accent dials resolve to, which in this template is its teal. Hover
        // still rides alpha on the
        // resting token; no `--*-hover` state token exists.
        default:
          "rounded-md border-primary-border bg-primary text-primary-foreground shadow-none hover:bg-primary/90",
        // Identity fill, and one of the four brand jobs pinned in
        // `palette.test.ts`. Filled controls stay on primary.
        brand:
          "rounded-md border-border-brand bg-brand text-brand-foreground shadow-none hover:bg-brand/90",
        // Page-coloured in BOTH themes. The dark-mode `input/30` wash this
        // dropped made an outline button read as a filled one at night, so
        // the variant changed meaning with the lights.
        outline:
          "border-border bg-background shadow-sm hover:bg-accent hover:text-foreground hover:shadow aria-expanded:bg-accent aria-expanded:text-foreground dark:border-input",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground aria-pressed:bg-secondary/60 aria-pressed:text-secondary-foreground aria-pressed:shadow-sm aria-pressed:ring-2 aria-pressed:ring-ring/40",
        // Pressed ≠ hover. A ghost toggle's hover fill is `--accent`, the
        // lift every other quiet hover in this system uses — it was `--muted`,
        // which is the elevation a RESTING plate sits at, so a hovered ghost
        // button looked like a raised panel rather than a button answering the
        // pointer. Its PRESSED state is the app's *selected*
        // vocabulary — the `--sidebar-selected` brand tint (semantic.css
        // "Sidebar selection language"), same as `data-active` rows in
        // `sidebar.tsx` and the rail's selected buttons. The
        // `aria-pressed:hover:` pair is the specificity-tie trick from
        // `sidebar.tsx`: a one-variant `hover:` rule ties with a one-variant
        // `aria-pressed:` rule, so without it hovering a pressed toggle
        // collapses it back to the hover fill.
        //
        // `aria-pressed:font-medium` is kept, and only started working when
        // the base dropped to `font-normal`: against a 500 base it resolved
        // 500 → 500 and rendered nothing. It is the same weight-as-selection
        // signal `sidebar.tsx` uses on `data-active`, and it is the reason
        // weight is reserved on this component rather than spent on resting
        // labels.
        ghost:
          "hover:bg-accent hover:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground aria-pressed:bg-sidebar-selected aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:hover:bg-sidebar-selected aria-pressed:hover:text-foreground",
        // SOLID. A 10% tint reads as a badge describing a risk rather than a
        // button that performs one, and this is the variant where being
        // unmistakable is the point.
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        // Role ink, not upstream's `text-primary` fill; tokenDiscipline.test.ts
        // refuses the bare fill, so a re-vendor that reverts this fails there.
        link: "text-text-primary underline-offset-4 hover:underline",
        // ONE variant, two shapes. There used to be a second entry here whose
        // class string was byte-for-byte identical to this one, so a touchpoint
        // face read as a different component when it is the same cell with a
        // different corner radius. The radius comes from
        // `blueprintCellButtonClassName`'s `touchpoint` variant, which is where
        // a shape belongs.
        blueprint:
          "border-transparent bg-clip-border text-foreground shadow-none ring-offset-0 transition-[box-shadow,transform,opacity] duration-150 ease-out [background-color:var(--background-blueprint-cell-panel,var(--background-blueprint-cell,var(--secondary)))] hover:[background-color:var(--background-blueprint-cell-hover,var(--background-blueprint-cell-panel,var(--background-blueprint-cell)))] aria-pressed:[background-color:var(--background-blueprint-cell-pressed,var(--background-blueprint-cell-hover))] aria-pressed:text-foreground aria-pressed:shadow-sm aria-pressed:inset-ring-2 aria-pressed:inset-ring-[color:var(--ring-blueprint-cell,var(--ring))] focus-visible:border-[color:var(--ring-blueprint-cell,var(--ring))] focus-visible:ring-[color:var(--ring-blueprint-cell,var(--ring))] focus-visible:ring-offset-0",
      },
      size: {
        default:
          "h-8 gap-2 px-2 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2 text-[0.8rem] in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-2 px-2 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 in-data-[slot=button-group]:rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 in-data-[slot=button-group]:rounded-md",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
