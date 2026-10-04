import { Play } from 'lucide-react'
import { useContext } from 'react'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { StoryboardWalkthroughContext } from '@/contexts/StoryboardWalkthroughContext'
import { isBlueprintStoryboardWalkthroughEnabled } from '@/lib/blueprintDisplayFlags'
import { pickWalkthroughBlueprint } from '@/lib/storyboardWalkthrough'
import type { BlueprintData } from '@/types/blueprint'
import { cn } from '@/lib/utils'

type BlueprintStoryboardPlayButtonProps = {
  blueprint?: BlueprintData | null
  blueprints?: BlueprintData[]
  scenarioName?: string
  phaseName?: string
  className?: string
}

/**
 * Opens the storyboard walkthrough for a path. Renders nothing when the feature is
 * off or when the surface sits outside a walkthrough provider (the homepage
 * renders grids that way).
 */
export function BlueprintStoryboardPlayButton({
  blueprint,
  blueprints,
  scenarioName,
  phaseName,
  className,
}: BlueprintStoryboardPlayButtonProps) {
  const walkthrough = useContext(StoryboardWalkthroughContext)
  const walkthroughBlueprints =
    blueprints?.length ? blueprints : blueprint ? [blueprint] : []
  const activeBlueprint =
    blueprint ?? pickWalkthroughBlueprint(walkthroughBlueprints)
  const pathLabel = activeBlueprint?.path.name?.trim()

  if (!isBlueprintStoryboardWalkthroughEnabled()) return null
  // Homepage / other surfaces may render grids outside the walkthrough provider.
  if (!walkthrough) return null

  const { openWalkthrough } = walkthrough
  const playLabel = pathLabel
    ? `Play ${pathLabel} storyboard walkthrough`
    : 'Play storyboard walkthrough'

  return (
    <IconTooltip label={playLabel}>
      <button
        type="button"
        className={cn(
          'tap-target-24 inline-flex size-5 shrink-0 items-center justify-center text-foreground transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30',
          className,
        )}
        aria-label={playLabel}
        disabled={!activeBlueprint}
        onClick={(event) => {
          event.stopPropagation()
          if (activeBlueprint) {
            // Presentation is scoped to the path whose play control was clicked.
            openWalkthrough(activeBlueprint, [activeBlueprint], {
              scenarioName,
              phaseName,
            })
          }
        }}
      >
        <Play className="size-3.5 fill-current" aria-hidden />
      </button>
    </IconTooltip>
  )
}
