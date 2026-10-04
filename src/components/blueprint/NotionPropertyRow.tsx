import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type NotionPropertyRowProps = {
  label: string
  children: ReactNode
  className?: string
}

/** Label-and-value row in the cell detail panel, styled after Notion properties. */
export function NotionPropertyRow({
  label,
  children,
  className,
}: NotionPropertyRowProps) {
  return (
    <div
      className={cn(
        'group -mx-1 flex min-h-[34px] items-start gap-3 rounded-md px-1 py-2 transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-accent/50',
        className,
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="w-[7.5rem] shrink-0 pt-1 text-sm text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
