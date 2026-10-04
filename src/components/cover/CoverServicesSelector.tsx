import type { ActiveService } from '@/contexts/ActiveServiceContext'
import { cn } from '@/lib/utils'

type CoverServicesSelectorProps = {
  services: ActiveService[]
  /** The active service's slug — the tab shown selected. */
  activeSlug: string | null
  /** Make a service active. Sets the URL slug and re-scopes the board. */
  onSelect: (slug: string) => void
}

/**
 * The cover's Services selector — the front door to a multi-service
 * deployment. It reuses the Skills tab's segmented-control pattern: a tab per
 * service on a recessed track, the active one lifted onto the background.
 * Picking one makes it active, which drives the URL and the board.
 *
 * Rendered only when a second service exists; the single-service tab shows no
 * selector row at all, so this component never mounts there.
 */
export function CoverServicesSelector({
  services,
  activeSlug,
  onSelect,
}: CoverServicesSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Services"
      className="flex w-fit flex-wrap gap-1 rounded-full bg-muted p-1"
    >
      {services.map((service) => {
        const isActive = service.slug === activeSlug
        return (
          <button
            key={service.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(service.slug)}
            className={cn(
              'rounded-full px-4 py-2 text-sm transition-colors motion-reduce:transition-none duration-(--motion-structural) ease-arrive',
              isActive
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {service.name}
          </button>
        )
      })}
    </div>
  )
}
