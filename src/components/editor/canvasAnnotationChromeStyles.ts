/**
 * The class strings the floating style bar's controls are cut from. They live
 * in a module of their own so a control can read the one vocabulary rather
 * than reach into a sibling for it: a slot, a round icon slot, a menu surface
 * and a menu item, all on the frozen `annotation-chrome` plane.
 *
 * They were `SHAPE_TOOLBAR_*` while they sat inside one file, which was already
 * only true of the first bar to want them — the sticky and text bars were cut
 * from the same four, which is a large part of why there is one bar now. A
 * name that reaches past one control has to say what it covers, so they are
 * the annotation bar's.
 */

export const ANNOTATION_BAR_TRIGGER_CLASS =
  'flex h-8 items-center gap-1 rounded-full px-2 text-(--foreground-annotation-chrome) transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-(--wash-annotation-chrome) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring-annotation-chrome)'

/**
 * The round icon-only slot in the floating style bars (currently every
 * bar's Delete): ANNOTATION_BAR_TRIGGER_CLASS's fixed-square sibling — same
 * white-on-dark hover and focus ring, but a centered `size-8` circle with
 * no label gutter.
 */
export const ANNOTATION_BAR_ICON_BUTTON_CLASS =
  'flex size-8 items-center justify-center rounded-full text-(--foreground-annotation-chrome-secondary) transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-(--wash-annotation-chrome) hover:text-(--foreground-annotation-chrome) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring-annotation-chrome)'

export const ANNOTATION_BAR_MENU_CLASS =
  'border-0 bg-annotation-chrome text-(--foreground-annotation-chrome) shadow-floating ring-1 ring-(--border-annotation-chrome-overlay)'

export const ANNOTATION_BAR_ITEM_CLASS =
  'gap-2 text-(--foreground-annotation-chrome) focus:bg-(--wash-annotation-chrome) focus:text-(--foreground-annotation-chrome) data-[highlighted]:bg-(--wash-annotation-chrome) data-[highlighted]:text-(--foreground-annotation-chrome)'
