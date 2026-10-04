/**
 * A row's secondary control waits for a reader.
 *
 * A list row says what it is at rest. What it *offers* — the grip that
 * reorders a resource — is worth reading one row at a time and not worth
 * reading down a list of eight. Static, such a control lines the list's edge
 * with grey furniture whether or not anyone is going to touch it.
 *
 * Revealed rather than removed, and by one rule: hover OR focus anywhere in
 * the row — so the row itself carries `group` — and always visible where the
 * pointer is coarse, because an affordance that only exists under a mouse is
 * not an affordance for everyone. Opacity alone, so the row keeps its height:
 * a list whose rows grow under the pointer moves the row being pointed at.
 * What is revealed stays in the DOM at all times, so a screen reader reads it
 * and the keyboard reaches it whether or not anything is hovering.
 *
 * Opacity is the right rule for a CONTROL, which has to stay where the finger
 * or cursor expects it. It was the wrong one for prose: the dependency
 * why-line used this and went on holding its line while invisible, so a list
 * of eight rows drew sixteen. That one reads from a tooltip now, and the rule
 * stays here — in a module rather than inlined into its one caller — because
 * the next row control is the one this exists to keep honest.
 */
export const ROW_REVEAL_CLASS =
  'opacity-0 transition-opacity ease-arrive duration-(--motion-micro) group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(pointer:coarse)]:opacity-100'
