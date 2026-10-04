import { useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CircleDashed,
  ClipboardList,
  Eye,
  FileText,
  Lightbulb,
  MessageSquare,
  Plus,
} from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DeferredSkeleton } from '@/components/ui/deferred-skeleton'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { OptionSelect } from '@/components/blueprint/OptionSelect'
import { Field, PANEL_TEXTAREA_CLASS } from '@/components/blueprint/panelShell'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useEvidence } from '@/hooks/useEvidence'
import { addEvidence } from '@/lib/evidenceMutations'
import { linkedTextSegments } from '@/lib/linkedText'
import { useActiveServiceId } from '@/contexts/activeService'
import type { Database, Evidence } from '@/types/database'

const EVIDENCE_KINDS = [
  'interview',
  'survey',
  'analytics',
  'doc',
  'meeting',
  'decision',
  'observation',
  'other',
] as const

type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

const KIND_ICONS: Record<EvidenceKind, typeof FileText> = {
  interview: MessageSquare,
  survey: ClipboardList,
  analytics: BarChart3,
  doc: FileText,
  meeting: CalendarCheck,
  decision: Lightbulb,
  observation: Eye,
  other: CircleDashed,
}

/**
 * The kinds, as the panel writes words: one capital, and nothing else.
 *
 * Derived from `EVIDENCE_KINDS` rather than listed a second time — a hand-kept
 * label table is a second place for the vocabulary to be true, and the only
 * difference between the stored word and the shown one is its first letter.
 */
const KIND_OPTIONS = EVIDENCE_KINDS.map((kind) => ({
  value: kind,
  label: kind.charAt(0).toUpperCase() + kind.slice(1),
}))

function kindIcon(kind: string) {
  const Icon = KIND_ICONS[kind as EvidenceKind] ?? CircleDashed
  return <Icon className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
}

/**
 * A saved source: one title, one kind, one note, one text treatment.
 *
 * It wore three at once — a monospaced link, an italic passage behind a left
 * rule, and the note — which is three ways of saying "this text is different"
 * stacked in a panel 264 pixels wide. The kind is a quiet suffix after the
 * title now, so the icon reinforces it rather than carrying it alone, and a
 * URL written inside the note is the link.
 */
function EvidenceRow({ row }: { row: Evidence }) {
  return (
    <li className="flex items-start gap-2 border-b border-muted py-2 last:border-0">
      {kindIcon(row.kind)}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-xs font-medium break-words text-foreground">
          {row.title}{' '}
          <span className="font-normal text-muted-foreground">{row.kind}</span>
        </p>
        {row.note ? (
          <p className="text-xs break-words text-muted-foreground">
            {linkedTextSegments(row.note).map((segment, index) =>
              segment.kind === 'link' ? (
                <a
                  key={index}
                  href={segment.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 transition-colors duration-(--motion-micro) ease-arrive motion-reduce:transition-none hover:text-foreground"
                >
                  {segment.text}
                </a>
              ) : (
                <span key={index}>{segment.text}</span>
              ),
            )}
          </p>
        ) : null}
      </div>
    </li>
  )
}

function AddSourceForm({
  client,
  cellId,
}: {
  client: SupabaseClient<Database>
  cellId: string
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<EvidenceKind>('interview')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The service the board is drawing — the resolved store's id. This used to
  // take the first service by `created_at`, so a deployment with two filed
  // the source against the one nobody was looking at; then it resolved the
  // slug for itself. With none active the form's button stays disabled — the
  // phase dialog's pattern — rather than falling back.
  const serviceId = useActiveServiceId()

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-fit gap-1 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3" />
        Add source
      </Button>
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || !serviceId || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      // Through the ledger wrapper, like every other write — an added source
      // shows in the session log and can be taken back.
      await addEvidence(client, {
        serviceId,
        cellId,
        // TODO(map-skill): id placeholder — real IR key-paths come from
        // the skill.
        cellKey: cellId,
        kind,
        title: title.trim(),
        note: note.trim() || null,
      })
      setOpen(false)
      setTitle('')
      setNote('')
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-2"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      {/* Three fields, one group, no rule between them. The form used to draw
          a locator and a quotation as separate questions from the title; of 66
          rows in production the locator was filled zero times and the
          quotation twice, once with a summary. `Field` supplies the label —
          a placeholder disappears the moment an author starts typing, and the
          asterisk is this panel's only signal that a field cannot be left
          empty, so its absence on Note is what says Note is optional. */}

      {/* A kind is a short enum and a title is a sentence, so they share a
          row. Stacked, they were two of three full-width boxes in a narrow
          panel, and the enum was as wide as the sentence. */}
      <div className="flex items-start gap-2">
        {/* A fixed column the width of the longest kind, "Observation", plus
            the trigger's padding, gap and chevron. A title is free text and
            scrolls; a kind is chosen by reading it, so the enum takes the
            fixed column and the title takes the rest. */}
        <div className="w-32 shrink-0">
          <Field label="Kind">
            {/*
              The panel's own select — the same control the Status and Role
              fields wear. What stood here was a native `<select>` with its own
              radius and border, no hover state, and a 28px box that left its
              value too little line to sit in.
            */}
            <OptionSelect
              value={kind}
              onChange={setKind}
              options={KIND_OPTIONS}
              aria-label="Kind"
            />
          </Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label="Title" required>
            {/* The shared input at its own height, which is the select
                trigger's height: two controls on one row meet at one
                baseline. */}
            <Input
              required
              placeholder="What the source is"
              aria-label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
        </div>
      </div>
      <Field label="Note">
        <textarea
          rows={3}
          placeholder="Anything worth keeping — a quotation, an observation, a link"
          aria-label="Note"
          className={PANEL_TEXTAREA_CLASS}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      {error ? (
        /* The source was not saved — an error, not a caution. */
        <Alert variant="destructive">
          <AlertTriangle className="size-3.5" aria-hidden />
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !serviceId}>
          {busy ? 'Adding…' : 'Add source'}
        </Button>
      </div>
    </form>
  )
}

/** Reserves the summary line plus one source row while evidence loads. */
function EvidenceLoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <Skeleton className="h-4 w-24 rounded-full" />
      <div className="flex items-start gap-2 py-2">
        <Skeleton className="mt-px size-3.5 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Skeleton className="h-3 w-2/3 rounded-full" />
          <Skeleton className="h-3 w-1/3 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-7 w-28 rounded-md" />
    </div>
  )
}

function EvidenceList({
  client,
  cellId,
}: {
  client: SupabaseClient<Database>
  cellId: string
}) {
  const result = useEvidence(cellId)

  if (result.status === 'error') {
    return (
      /* The fetch failed and the list is empty — an error, not a caution. */
      <Alert variant="destructive">
        <AlertTriangle className="size-3.5" aria-hidden />
        <AlertDescription className="text-xs">
          Evidence could not be loaded: {result.message}
        </AlertDescription>
      </Alert>
    )
  }

  const rows = result.status === 'ready' ? result.data : []

  return (
    <DeferredSkeleton
      loading={result.status === 'loading'}
      skeleton={<EvidenceLoadingSkeleton />}
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          {rows.length === 0 ? (
            <>
              <span aria-hidden>○ </span>
              assumption — no evidence yet
            </>
          ) : (
            <>
              {rows.length} {rows.length === 1 ? 'source' : 'sources'}
            </>
          )}
        </p>
        {rows.length > 0 ? (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <EvidenceRow key={row.id} row={row} />
            ))}
          </ul>
        ) : null}
        <AddSourceForm client={client} cellId={cellId} />
      </div>
    </DeferredSkeleton>
  )
}

type CellEvidenceTabProps = {
  /** Canonical (resolved) cell id; null when the cell is fallback-only. */
  cellId: string | null
}

/**
 * Evidence tab. Restricted SELECT means anonymous sessions must see a
 * sign-in prompt — never an all-assumption state derived from an empty
 * restricted read. No-DB sessions get an offline note.
 */
export function CellEvidenceTab({ cellId }: CellEvidenceTabProps) {
  const { client, configured, canWrite } = useSupabase()

  if (!configured || !client) {
    return (
      <p className="text-xs text-muted-foreground">
        Evidence is unavailable offline.
      </p>
    )
  }
  if (!canWrite) {
    return (
      <p className="text-xs text-muted-foreground">
        Evidence requires a connected editor.
      </p>
    )
  }
  if (!cellId) {
    return (
      <p className="text-xs text-muted-foreground">
        This cell is not in the database yet, so it cannot carry evidence.
      </p>
    )
  }

  return <EvidenceList client={client} cellId={cellId} />
}
