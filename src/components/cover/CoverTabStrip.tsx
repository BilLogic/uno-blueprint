import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { CoverTab } from '@/components/cover/coverModel'
import { cn } from '@/lib/utils'

/*
 * Edge-fade masks for an overflowing tab list — the same signal TabStrip.tsx
 * uses: content is clipped where the fade is, so there is more that way. No
 * scrollbar, which would put chrome on an orientation page.
 */
const MASK_BOTH =
  '[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]'
const MASK_START =
  '[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]'
const MASK_END =
  '[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]'

/**
 * The line-variant tab list with the animated shared indicator, lifted from
 * the landing page it replaces. Two additions for a four-label strip: the
 * list scrolls horizontally when the labels do not fit (edge-fade instead of
 * a scrollbar), and the indicator recomputes on scroll as well as resize —
 * its math reads live rects, so a scrolled list would otherwise strand it.
 *
 * The rule that keeps both of those honest: the scrolling element holds
 * nothing but the triggers. The border and the indicator — the two pieces
 * that need to sit ON the baseline rather than above it — live on a
 * non-scrolling wrapper instead. See the comment on the wrapper for why.
 */
export function CoverTabStrip({
  tabs,
  activeTab,
}: {
  tabs: Pick<CoverTab, 'value' | 'label'>[]
  activeTab: string
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef(new Map<string, HTMLElement>())
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false })
  const [overflow, setOverflow] = useState({ start: false, end: false })

  const setTriggerRef = useCallback(
    (value: string) => (node: HTMLElement | null) => {
      if (node) triggerRefs.current.set(value, node)
      else triggerRefs.current.delete(value)
    },
    [],
  )

  const update = useCallback(() => {
    const frame = frameRef.current
    const list = listRef.current
    if (!frame || !list) return

    const trigger = triggerRefs.current.get(activeTab)
    if (trigger) {
      const frameRect = frame.getBoundingClientRect()
      const triggerRect = trigger.getBoundingClientRect()
      setIndicator({
        // Offset within the frame, which does not scroll — so this is the
        // trigger's live on-screen position, already carrying whatever
        // `scrollLeft` the list is at. Scrolling fires `update` below, which
        // is what keeps that true.
        left: triggerRect.left - frameRect.left,
        width: triggerRect.width,
        ready: true,
      })
    }

    const scrollable = list.scrollWidth - list.clientWidth > 1
    setOverflow({
      start: scrollable && list.scrollLeft > 1,
      end: scrollable && list.scrollLeft < list.scrollWidth - list.clientWidth - 1,
    })
  }, [activeTab])

  useLayoutEffect(() => {
    update()
  }, [update])

  useEffect(() => {
    const list = listRef.current
    if (!list) return

    const observer = new ResizeObserver(() => update())
    observer.observe(list)
    for (const trigger of triggerRefs.current.values()) {
      observer.observe(trigger)
    }

    list.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [update])

  return (
    <div
      ref={frameRef}
      data-cover-tab-frame
      className={cn(
        // `flex`, not `block`: TabsList is inline-flex, and an inline-level
        // child sits on a line box — which adds the font's descender space
        // under it, pushing the border 3px clear of the labels. As a flex
        // item it has no line box, so the baseline lands where the list ends.
        'relative flex w-full border-b border-border',
        /*
          `clip`, not `hidden`. Both stop the indicator from painting past
          the ends of the strip when the list is scrolled, but `hidden`
          would make this a scroll container — and CSS forces the two
          overflow axes to compute together, so a `hidden` here would
          reopen on Y the same phantom 2px scroll region this structure
          exists to remove. `clip` is not a scrolling value, so it pairs
          with `overflow-y: visible` and leaves the axis alone.
        */
        'overflow-x-clip',
        overflow.start && overflow.end && MASK_BOTH,
        overflow.start && !overflow.end && MASK_START,
        !overflow.start && overflow.end && MASK_END,
      )}
    >
      <TabsList
        ref={listRef}
        variant="line"
        className={cn(
          'h-auto w-full justify-start gap-6 rounded-none border-0 bg-transparent p-0',
          // The one scrolling axis. Nothing in here bleeds past the padding
          // box, so `scrollHeight` equals `clientHeight` and the Y axis has
          // nothing to scroll even though the rule above computes it to a
          // scrolling value. `overflow-y-hidden` states that outright rather
          // than leaving it to hold.
          'overflow-x-auto overflow-y-hidden',
          // A trackpad's "vertical" gesture carries a small stray deltaX
          // from ordinary hand movement, and this is the one horizontally-
          // scrolling surface on an otherwise vertically-scrolling page.
          // `-x` only — the page's own vertical scroll must still chain.
          'overscroll-x-contain',
          // Hide any scrollbar the platform still paints; the fade is the signal.
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            ref={setTriggerRef(tab.value)}
            value={tab.value}
            className={cn(
              'h-auto flex-none rounded-none px-0 pb-3 pt-0 text-sm font-medium',
              'text-muted-foreground transition-colors motion-reduce:transition-none duration-(--motion-structural) ease-arrive',
              'hover:text-foreground data-active:text-foreground',
              // Hide the default after-underline; we animate a shared indicator instead.
              'after:hidden',
            )}
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {/*
        Outside the scrolling list on purpose. At `bottom-[-1px] h-0.5` it
        straddles the border it replaces, and anything that hangs past a
        scroll container's padding edge enlarges that container's scrollable
        region without touching its layout height — which is how 2px of
        invisible, wheel-catchable vertical scroll got into the strip. Out
        here it can bleed over the border line and be painted in full.
      */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute bottom-[-1px] h-0.5 bg-foreground',
          'transition-[left,width,opacity] duration-(--motion-structural) ease-move motion-reduce:transition-none',
          indicator.ready ? 'opacity-100' : 'opacity-0',
        )}
        style={{ left: indicator.left, width: indicator.width }}
      />
    </div>
  )
}
