import { cn } from '@/lib/utils'

/**
 * A small sentence-case word over the thing it names — the EYEBROW register.
 *
 * WHY IT IS A COMPONENT. Twenty-odd places had written this by hand, and they
 * drifted apart on surfaces a reader meets in the same minute. Each string was
 * legal on its own, which is why nobody caught it in review — the drift is
 * only visible when you count. One spelling of size, weight and ink, in one
 * file, is what stops the next paste from inventing a twenty-first.
 *
 * HOW IT READS. 12px sans, muted ink, letter-spacing 0, in the case the string
 * was written in. It used to be capitals with wide tracking; that read as a
 * second voice in chrome that has one, and capitals forced by CSS also flatten
 * a label's own casing (an acronym, a name) into noise. The string carries its
 * case — write `Services`, not `SERVICES`, and nothing here changes it.
 *
 * WHAT AN EYEBROW IS, so a call site can tell whether it has one. It labels a
 * REGION of chrome — a group in a menu, the head of an annotation plate, a
 * column in a comparison — where the label is furniture and the content beside
 * it is the subject. It is not:
 *
 *   - a panel section label (`PanelSectionLabel`): inside a panel, a section
 *     name is an inert word. The two now read the same; they stay two names
 *     because they answer different questions — where you are, and what this
 *     field is.
 *   - a status or a category (`Badge`): those say what a thing IS. An eyebrow
 *     says where you are.
 */
export function Eyebrow({
  children,
  className,
  ...rest
}: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'text-xs font-medium text-muted-foreground',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}
