import { Fragment, type ReactNode } from 'react'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { BLUEPRINT_MENUBAR_PHASE_CRUMB_CLASS } from '@/components/editor/menubarHeaderLayout'
import { useEditor } from '@/contexts/EditorContext'
import {
  getSlideBreadcrumbs,
  WORKSPACE_BREADCRUMB_ID,
  type NavItem,
} from '@/types/nav'

type ScenarioMenubarBreadcrumbProps = {
  slide: NavItem
  slides: NavItem[]
  /**
   * The current crumb, built by whoever owns the identity — `EntityHeader`,
   * which hands this component the title affordance it would otherwise have
   * rendered beside the trail. This component never derives the entity from
   * the slide: there is one builder of that affordance and it is not here.
   */
  current: ReactNode
}

/**
 * The scenario header's trail, and the header's ONLY title.
 *
 * `Phase › Scenario` on one baseline, both crumbs on the list's one rung
 * (13px on the type ladder) with the vendored 14px chevron between them. The
 * current crumb is not a quieter echo of a title printed beside it — it IS the
 * title. The header used to render the phase as a lone 12px grey word next to
 * a separate 14px title, which said the same name twice and read as a floating
 * label rather than a hierarchy.
 *
 * The workspace crumb is dropped. Its label is this template's own name, and
 * a deployment's header must not print it — see `deploymentOwnedContent`.
 */
export function ScenarioMenubarBreadcrumb({
  slide,
  slides,
  current,
}: ScenarioMenubarBreadcrumbProps) {
  const { openDetail, goHome } = useEditor()
  const visibleCrumbs = getSlideBreadcrumbs(slide, slides).filter(
    (crumb) => crumb.id !== WORKSPACE_BREADCRUMB_ID,
  )

  if (visibleCrumbs.length === 0) return null

  const navigateToCrumb = (crumbId: string) => {
    if (crumbId === WORKSPACE_BREADCRUMB_ID) {
      goHome()
      return
    }

    openDetail(crumbId)
  }

  return (
    <Breadcrumb className="min-w-0">
      {/* `flex-nowrap`, because a trail that wraps inside a bar pinned to two
          lines pushes the summary out. Size and ink are the vendored list's
          own — the change here was dropping a `text-xs` override, not adding
          one back. */}
      <BreadcrumbList className="flex-nowrap gap-1">
        {visibleCrumbs.map((crumb, index) => {
          const isLast = index === visibleCrumbs.length - 1

          return (
            <Fragment key={crumb.id}>
              {/*
                The current crumb FILLS what the phase crumb leaves.

                `aria-current` rides on the ITEM rather than on a
                `BreadcrumbPage` wrapper: the page slot is a `role="link"`
                span, and the current crumb is a real `<button>` that opens the
                entity panel — an interactive control inside a link role is one
                target announced as two. The list item carries the marker and
                the button stays the only thing focus lands on.
              */}
              <BreadcrumbItem
                aria-current={isLast ? 'page' : undefined}
                className={isLast ? 'min-w-0 flex-1' : undefined}
              >
                {isLast ? (
                  current
                ) : (
                  <BreadcrumbLink
                    render={<button type="button" />}
                    // The cap clips the label, so the full name has to live
                    // somewhere the reader can still reach it.
                    title={crumb.label}
                    onClick={() => navigateToCrumb(crumb.id)}
                    className={BLUEPRINT_MENUBAR_PHASE_CRUMB_CLASS}
                  >
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast ? <BreadcrumbSeparator /> : null}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
