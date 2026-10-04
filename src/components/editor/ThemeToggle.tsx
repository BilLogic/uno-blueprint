import { AnimatePresence, motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Button } from '@/components/ui/button'
import { EASE_POINTS, MOTION_MICRO_MS, prefersReducedMotion } from '@/lib/motion'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  className?: string
  size?: 'icon-sm' | 'icon-xs'
}

/**
 * Light/dark switch for the app shell.
 *
 * Paints the right glyph on its FIRST render. It used to paint a disabled
 * placeholder instead, because `next-themes` resolved the theme in an effect
 * and the icon would otherwise have flashed the wrong one on every load for
 * anyone not on the default. `lib/theme.ts` reads the stored theme while its
 * module evaluates, so the answer exists before this component is called and
 * there is nothing to wait for.
 *
 * The presentation stage is exempt — it pins `.dark` on its own subtree
 * regardless of this setting, because a projected slide is always dark.
 */
export function ThemeToggle({ className, size = 'icon-xs' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <IconTooltip
      label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      side="right"
    >
      <Button
        type="button"
        variant="ghost"
        size={size}
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground',
          className,
        )}
        onClick={toggleTheme}
        aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      >
        {/*
         * The icon swap is a mount/unmount, so the outgoing glyph needs an exit
         * animation — the one thing a CSS transition cannot express, and the
         * reason framer-motion is here rather than another keyframe. Duration is
         * the shared micro-interaction value, and reduced motion collapses it to
         * a plain swap.
         */}
        {/* ONE positioning layer. `popLayout` already takes the OUTGOING
            glyph out of flow and holds its box, so absolutely positioning
            the resident one as well was a second mechanism doing the first
            one's job — and the `relative` it needed existed only to anchor
            it. The grid centres both. */}
        <span className="grid size-3.5 place-items-center">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="grid place-items-center"
              initial={{ opacity: 0, rotate: -90 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 90 }}
              transition={{
                duration: prefersReducedMotion() ? 0 : MOTION_MICRO_MS / 1000,
                ease: EASE_POINTS.arrive,
              }}
            >
              {isDark ? (
                <Sun className="size-3.5" aria-hidden />
              ) : (
                <Moon className="size-3.5" aria-hidden />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </Button>
    </IconTooltip>
  )
}
