import { Settings } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { AgentSettingsFields } from '@/components/editor/AgentSettingsFields'
import {
  setAgentSettingsOpen,
  useAgentSettingsOpen,
} from '@/lib/agent/settings'

/**
 * The ⚙ at the rail's bottom: admin sign-in always; provider/model/key only
 * when this session can write. On the deployed site the gear is therefore
 * the front door — sign in as an admin (accounts are hand-created; public
 * sign-ups stay disabled) and the authoring surface + agent appear. RLS is
 * still the authority; this UI only starts a session.
 */
export function AgentSettingsRailButton() {
  const open = useAgentSettingsOpen()
  const setOpen = setAgentSettingsOpen

  return (
    <TooltipProvider delay={300}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <button
                    type="button"
                    aria-label="Agent settings"
                    className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                  >
                    <Settings className="size-4" aria-hidden />
                  </button>
                }
              />
            }
          />
          <TooltipContent side="right" className="text-xs">
            Agent settings
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="right" align="end" className="w-72 p-3">
          <AgentSettingsFields active={open} />
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  )
}
