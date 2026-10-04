import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  children: ReactNode
  /**
   * Changing this clears the error. Pass whatever identifies "where the user
   * is" — the mobile surface + scenario, the active desktop tab — so that
   * navigating away from a broken view is enough to recover.
   */
  resetKey?: string
  /** How much of the app went with the throw. See the class comment. */
  scope?: BoundaryScope
}
type State = { error: Error | null }

/** How much of the app went with the throw. Defaults to `'view'`. */
type BoundaryScope = 'view' | 'app'

/**
 * What the reader is told, per scope — one of the two things the scope
 * varies, the other being which button is emphasised. Apart, and not inline
 * in the JSX, because the difference between the two placements is exactly
 * these two sentences and putting them where they can be read side by side is
 * what keeps it so.
 */
const MESSAGE: Record<BoundaryScope, string> = {
  view:
    'This view hit an error and stopped rendering. Try again, or move to ' +
    'another scenario — the rest of the app is still working. If it keeps ' +
    'happening on one phase or scenario, that view may be too heavy for ' +
    'this device.',
  app:
    'The app hit an error while starting, so nothing below this point came ' +
    'up. Reload the page — that is the way back from most of them. If it ' +
    'keeps happening, the line below and the browser console say what failed.',
}

/**
 * A last line before the white screen.
 *
 * The editor is a large, always-mounted canvas; a throw anywhere in it used
 * to unmount the whole tree with no fallback, so a bug — or a mobile tab
 * running out of memory mid-render — showed the user a blank page. This
 * keeps a designed surface on screen and a way back, and logs the error
 * where a human can find it. A true OOM still kills the tab (nothing in JS
 * can catch that), but every recoverable throw now degrades instead of
 * disappearing.
 *
 * Recovery matters as much as the fallback. This app has no router, so
 * without a reset a single throw would persist until a manual reload and
 * every gesture afterwards would appear dead — one bug reading as "the app
 * crashes constantly". Two ways back: `resetKey` clears the error when the
 * user navigates, and "Try again" re-renders in place, which keeps the agent
 * session and view state that a reload would discard.
 *
 * ── TWO PLACEMENTS, ONE CLASS ─────────────────────────────────────────────
 *
 * This paragraph is the home of the rule; everywhere else points here.
 *
 * Inside the shells (`scope="view"`, the default) it guards a view, with the
 * chrome beside it still working. At the top of `App` (`scope="app"`) it
 * guards the start-up: a provider that throws unmounts everything, so a
 * boundary below one catches nothing that the deployment seam, the database
 * client or the address-bar components do — and `DeploymentConfigProvider`
 * rethrows a failed blueprint-registry loader on purpose. It ships inside
 * `App` rather than being left to a host, because a boundary a host has to
 * remember to install is a boundary that is eventually not installed.
 *
 * `scope` varies two things and nothing else: the sentence, and which of the
 * two buttons is emphasised. A view inside a working app can be navigated
 * away from, so "Try again" leads; a start-up failure cannot, so "Reload"
 * leads and the copy names it. Both buttons are on both, the card and the
 * error line are one design, and a second fallback component would be a
 * second design the moment one of them was touched.
 *
 * "Try again" at the app scope remounts the tree, which does re-run whatever
 * failed to start — but a missing chunk is not among the things it recovers:
 * the browser records the failed module, so re-importing the same specifier
 * rejects again without a refetch, and only the reload fetches anything.
 *
 * ABOVE EVERYTHING is true of the TREE, not of the module graph. A throw
 * while `App`'s own imports evaluate, or anything in `main.tsx` before React
 * renders, is still a blank page: there is no React on the stack yet to catch
 * it.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Prefixed with what actually fell over: a start-up failure has no editor
    // in it, and a console line that says otherwise sends the reader looking
    // in the wrong half of the tree.
    const where = this.props.scope === 'app' ? 'app' : 'editor'
    console.error(`[${where}] uncaught error:`, error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error !== null && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    const scope = this.props.scope ?? 'view'
    // The emphasised control is the one the sentence above it names.
    const leads = scope === 'app' ? 'reload' : 'retry'
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-background p-8">
        <div className="flex max-w-md flex-col items-start gap-3 rounded-xl border border-border bg-card p-6">
          <h1 className="text-base font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            {MESSAGE[scope]}
          </p>
          <p className="w-full truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={leads === 'retry' ? 'default' : 'ghost'}
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </Button>
            <Button
              size="sm"
              variant={leads === 'reload' ? 'default' : 'ghost'}
              onClick={() => window.location.reload()}
            >
              Reload
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
