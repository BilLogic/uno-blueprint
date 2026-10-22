import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconTooltip } from '@/components/editor/IconTooltip'
import {
  Field,
  LANE_PANEL_FOOTER_ID,
  PanelFooterControls,
  PanelFooterHost,
  PanelHeader,
  PanelEmpty,
  PanelIdentity,
  PanelKindBadge,
} from '@/components/blueprint/panelShell'
import { LanePanelLoading } from '@/components/blueprint/panelLoading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle } from 'lucide-react'
import { StakeholderSelect } from '@/components/blueprint/StakeholderSelect'
import { useLaneSpec, type LaneSpec } from '@/hooks/useLaneSpec'
import { useOwnerTags } from '@/hooks/useOwnerTags'
import { usePanelFooterHost } from '@/hooks/usePanelFooterHost'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { updateLaneSpec } from '@/lib/laneSpecMutations'
import { describeLaneRole, getLaneRole, labelLaneRole } from '@/lib/laneRoles'
import { getBlueprintLaneStyle } from '@/lib/blueprintTheme'

/**
 * Nothing an author has said about this lane, so a reader gets `PanelEmpty`
 * instead of four fields saying "none".
 *
 * THE STAKEHOLDER COUNTS, and it did not until the registry's definitions got
 * a reader. The comment here used to read "the stakeholder is structural",
 * which was true of the value and false of the panel: 74 of the 75 lanes that
 * name a stakeholder carry no owner team, KPI or tool — every lane that names
 * a person rather than a team, because
 * `references/lane-vocabulary.md` says an actor lane names a person and so
 * takes no owning team. Leaving the stakeholder out of this test meant the one
 * surface that shows who a lane belongs to, and what the registry says that
 * party IS, was replaced by an empty state on almost every lane that had one.
 */
function isLaneEmpty(lane: LaneSpec): boolean {
  return (
    lane.stakeholderId === null &&
    !lane.ownerTeam.trim() &&
    lane.kpis.length === 0 &&
    lane.tools.length === 0
  )
}

/**
 * The lane's properties: who owns it, what it is measured by, what it runs on.
 *
 * Three columns that have been writable since July and have never had a
 * surface. The panel is deliberately lean — no evidence, resources or
 * dependency tabs, because `evidence.cell_id`, `resources.cell_id` and
 * `cell_dependencies` all key on a CELL and a lane has no link to any of them.
 */
export function LanePanel({
  laneId,
  onClose,
}: {
  laneId: string
  onClose: () => void
}) {
  const { canWrite } = useSupabase()
  const canEdit = useCanvasModeValue() === 'design' && canWrite
  const result = useLaneSpec(laneId)
  const lane = result.status === 'ready' ? result.data : null

  return (
    <>
      <PanelHeader
        // Where the lane is, not what it is — the name is the heading below.
        // Same division as the cell panel, whose crumb ends at the step and
        // whose title is the cell's own text.
        crumbs={[lane?.phaseName ?? '', lane?.scenarioName ?? '']}
        title="Lane properties"
        description="Owner, KPIs and tools for the selected lane"
        closeLabel="Close lane properties"
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 blueprint-scroll">
        {lane && isLaneEmpty(lane) && !canEdit ? (
          <PanelEmpty subject="lane" />
        ) : lane ? (
          <LanePanelBody key={lane.id} lane={lane} onDone={onClose} />
        ) : result.status === 'error' ? (
          <p className="text-sm text-muted-foreground">
            That lane could not be loaded: {result.message}
          </p>
        ) : (
          <LanePanelLoading />
        )}
      </div>
      <PanelFooterHost id={LANE_PANEL_FOOTER_ID} />
    </>
  )
}

type FormState = {
  ownerTeam: string
  kpis: string[]
  tools: string[]
  stakeholderId: string | null
}

function LanePanelBody({
  lane,
  onDone,
}: {
  lane: LaneSpec
  onDone: () => void
}) {
  const { client, canWrite } = useSupabase()
  // View mode presents everything read-only, exactly as the cell panel does.
  const canEdit = useCanvasModeValue() === 'design' && canWrite
  const ownerTagsResult = useOwnerTags()
  const ownerTags =
    ownerTagsResult.status === 'ready' ? ownerTagsResult.data : []

  const saved: FormState = {
    ownerTeam: lane.ownerTeam,
    kpis: lane.kpis,
    tools: lane.tools,
    stakeholderId: lane.stakeholderId,
  }
  const [baseline, setBaseline] = useState<FormState>(saved)
  const [form, setForm] = useState<FormState>(baseline)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const footerHost = usePanelFooterHost(LANE_PANEL_FOOTER_ID)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const changed =
    form.stakeholderId !== baseline.stakeholderId ||
    form.ownerTeam !== baseline.ownerTeam ||
    JSON.stringify(form.kpis) !== JSON.stringify(baseline.kpis) ||
    JSON.stringify(form.tools) !== JSON.stringify(baseline.tools)

  // Cache revalidation may finish after this panel opens. Adopt it only before
  // the author types, preserving both a draft and its original undo baseline.
  if (!changed && !busy && JSON.stringify(saved) !== JSON.stringify(baseline)) {
    setBaseline(saved)
    setForm(saved)
  }

  const handleSave = async () => {
    if (!client || busy || !changed) return
    setBusy(true)
    setError(null)
    try {
      await updateLaneSpec(client, lane.siblingLaneIds, form, baseline)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  const fanOut = lane.siblingLaneIds.length
  const resolvedRole = getLaneRole({ name: lane.name, role: lane.role })
  /*
    The badge takes its colour the same way a CELL does — through
    `getBlueprintLaneStyle`, whose `.lane` is the key blueprint.css paints
    from. The zone argument only decides the fallback for a lane with neither
    a role nor a known name, and the panel has no lane stack to read a zone
    from, so it asks for the frontstage fallback: a grey-ish badge on an
    unclassified lane, rather than a wrong-family colour.
  */
  const laneRole = getBlueprintLaneStyle(lane.name, 'frontstage', lane.role)
    .lane

  return (
    <div
      className="flex flex-col gap-4"
      data-panel-editor=""
      // Read by every dismiss path: closing mid-save reads as "cancelled"
      // while the write lands anyway.
      data-busy={busy || undefined}
    >
      <PanelIdentity
        /* The badge says WHICH KIND of lane, in words, and carries that
           lane's own colour — the cell panel's badge is the lane name for the
           same reason. A generic "Lane" badge above a sentence describing the
           role was one fact wearing two sizes. */
        /* No ⓘ beside it: the badge IS the word whose meaning is in question,
           so its own hover is where a reader would look for the definition.
           A second control for one fact was one control too many. */
        badge={
          <PanelKindBadge
            label={labelLaneRole(resolvedRole)}
            laneRole={laneRole}
            description={describeLaneRole(resolvedRole)}
          />
        }
        title={lane.name}
        /*
          A cell count told the reader nothing they came here to learn. What
          IS worth a line is the one surprise this panel holds: an edit here
          moves several rows. Nothing else, and nothing at all when it does
          not apply.
        */
        meta=""
      />

      {/*
        An inline Alert, not a hover and not an ⓘ.

        This is a consequence the reader would be surprised by — one Save
        writes several rows — and the whole point of saying it is that they
        must not miss it. A hover can be missed by never hovering, and an ⓘ
        can be missed by never clicking. Something that must be read is
        always visible; that is the rule, and `Alert` is how the design
        system already says it.
      */}
      {canEdit && fanOut > 1 ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <AlertDescription className="text-xs">
            Saving writes all {fanOut} “{lane.name}” lanes in{' '}
            {lane.scenarioName}. A lane row belongs to one path, so the same
            lane would otherwise claim a different owner depending on which
            path you were looking at.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* ACTOR, not Stakeholder. The column is `lanes.stakeholder_id` and the
          registry it points into is `stakeholders`; the word on screen is the
          one the rest of this vocabulary uses for a party standing in the room
          — see references/interface-schema-map.md, which records the divergence
          and its reason. */}
      <Field
        label="Actor"
        hint="Which member of the service's cast this lane is, and what the registry says that party is. Structural rows — tech, support, storyboard — have nobody."
      >
        <StakeholderSelect
          value={form.stakeholderId}
          disabled={!canEdit}
          onChange={(next) => set('stakeholderId', next)}
        />
      </Field>

      <Field
        label="Owner team"
        hint="The team accountable for this lane. A cell can override it."
      >
        {canEdit ? (
          <>
            <Input
              value={form.ownerTeam}
              // A datalist suggests, never blocks — same treatment as the
              // cell panel's owner field, and the same vocabulary behind it.
              list="lane-owner-tags"
              className="h-7 text-xs"
              onChange={(event) => set('ownerTeam', event.target.value)}
            />
            <datalist id="lane-owner-tags">
              {ownerTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </>
        ) : (
          // A disabled empty input reads as a broken control. Read-only is
          // prose, the same as every other value in these panels.
          <p className="text-sm font-normal text-foreground">
            {form.ownerTeam || (
              <span className="text-muted-foreground">
                Not specified — no team recorded for this lane.
              </span>
            )}
          </p>
        )}
      </Field>

      <StringListField
        label="KPIs"
        hint="How this lane is measured. One per row."
        addLabel="Add a KPI"
        removeLabel="Remove KPI"
        placeholder="e.g. session completion"
        values={form.kpis}
        disabled={!canEdit}
        onChange={(next) => set('kpis', next)}
      />

      <StringListField
        label="Tools"
        hint="What this lane runs on. One per row."
        addLabel="Add a tool"
        removeLabel="Remove tool"
        placeholder="e.g. Zoom"
        values={form.tools}
        disabled={!canEdit}
        onChange={(next) => set('tools', next)}
      />

      {canEdit ? (
        <PanelFooterControls
          footerHost={footerHost}
          busy={busy}
          changed={changed}
          error={error}
          onSave={handleSave}
          onCancel={onDone}
        />
      ) : null}
    </div>
  )
}

/**
 * A list of short strings, one per row — the `kpis` and `tools` jsonb arrays.
 *
 * Row shape copied from the cell panel's value_props editor: same `h-7`, same
 * `text-xs`, same ghost remove button, same self-start add button that says
 * what it adds rather than showing a bare ＋.
 */
function StringListField({
  label,
  hint,
  addLabel,
  removeLabel,
  placeholder,
  values,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  addLabel: string
  removeLabel: string
  placeholder: string
  values: string[]
  disabled: boolean
  onChange: (next: string[]) => void
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={value}
              placeholder={placeholder}
              disabled={disabled}
              className="h-7 min-w-0 flex-1 text-xs"
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  ),
                )
              }
            />
            {disabled ? null : (
              <IconTooltip label={removeLabel}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={removeLabel}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onChange(values.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <X className="size-3" />
                </Button>
              </IconTooltip>
            )}
          </div>
        ))}
        {values.length === 0 && disabled ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : null}
        {disabled ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start px-2 text-muted-foreground hover:text-foreground"
            onClick={() => onChange([...values, ''])}
          >
            <Plus className="size-3" />
            {addLabel}
          </Button>
        )}
      </div>
    </Field>
  )
}
