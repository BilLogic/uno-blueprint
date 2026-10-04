import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  ChevronLeft,
  Loader2,
  Pencil,
  SendHorizontal,
  Sparkles,
  Square,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { Marker, MarkerContent, MarkerIcon } from '@/components/ui/marker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { IconTooltip } from '@/components/editor/IconTooltip'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { AgentTrialBanner } from '@/components/editor/AgentTrialBanner'
import {
  ComposerInkedField,
  type FieldSelection,
} from '@/components/editor/agent/ComposerInkedField'
import { ChangeCount } from '@/components/editor/agent/ChangeCount'
import { RenameSessionDialog } from '@/components/editor/agent/SessionDialogs'
import { blockTranscript } from '@/components/editor/agent/transcriptBlocks'
import { TranscriptRow } from '@/components/editor/agent/TranscriptRow'
import { TranscriptStepsBlock } from '@/components/editor/agent/TranscriptStepsBlock'
import { useAgentChangeCount } from '@/components/editor/agent/useAgentChangeCount'
import { useOfflineBoard } from '@/contexts/DeploymentConfigContext'
import { useSupabase } from '@/contexts/SupabaseProvider'
import { useCanvasModeValue } from '@/contexts/canvasModeContext'
import { usePathSelectionContext } from '@/hooks/usePathSelection'
import {
  describeChange,
  sessionSnapshot,
  subscribeToSession,
} from '@/lib/authoringSession'
import {
  hydrateAgentTranscript,
  sendToAgent,
  stopAgent,
  useAgentRun,
} from '@/lib/agent/loop'
import { useAgentPersistenceWorkPending } from '@/lib/agent/persistenceReadiness'
import { decideSend, type SendAnswer } from '@/lib/agent/sendDecision'
import {
  AGENT_SKILL_COMMANDS,
  completeSkillToken,
  findSkillLookup,
  skillMatchesQuery,
  type AgentSkillCommand,
  type SkillNearMiss,
} from '@/lib/agent/skills'
import {
  clearAgentDraft,
  renameAgentSession,
  setAgentDraft,
  setPendingAgentAttachment,
  takePendingAgentAttachment,
  useAgentDraft,
  usePendingAgentAttachment,
  type AgentSession,
} from '@/lib/agent/sessions'
import {
  hasKey,
  modelFor,
  openAgentSettings,
  useAgentSettings,
} from '@/lib/agent/settings'
import { cn } from '@/lib/utils'

/**
 * Step 2 of the ✦ surface: one conversation, full height — the transcript,
 * the composer with its slash menu, and the header that renames it. Which
 * session this is comes in as the session itself; going back is the panel's
 * to decide, so it comes in as a callback.
 */
export function AgentChatView({
  session,
  onBack,
}: {
  session: AgentSession
  onBack: () => void
}) {
  const settings = useAgentSettings()
  const { client, canAgentWrite, canAgent, isSampleTrial } = useSupabase()
  // The board the canvas beside this panel is drawing: a trial with no
  // database answers its reads from the same one.
  const offlineBoard = useOfflineBoard()
  const mode = useCanvasModeValue()
  const { activePathKeys } = usePathSelectionContext()
  const changes = useSyncExternalStore(subscribeToSession, sessionSnapshot)
  const keyed = hasKey(settings)
  // Same reason the panel keeps the open session outside the component,
  // plus a bonus: drafts are per session, so switching conversations no
  // longer eats what you were typing.
  const draft = useAgentDraft(session.id).text
  const setDraft = (text: string) => setAgentDraft(session.id, { text })
  const attachment = usePendingAgentAttachment()
  const { events, running } = useAgentRun(session.id)
  // Same canAgent gate as the sessions list: without persistence the
  // "not yet hydrated" half of the flag would be a forever-skeleton.
  const transcriptHydrating =
    useAgentPersistenceWorkPending({ kind: 'transcript', id: session.id }) &&
    canAgent &&
    !isSampleTrial
  const changeCount = useAgentChangeCount(session.id)
  const [renaming, setRenaming] = useState(false)
  // The near misses the reader has been asked about — `/audit`, which names
  // no skill — waiting on the one choice only they can make: spell them
  // properly and run them, or send the sentence as prose. A token that DOES
  // resolve never lands here; it is coloured and it runs. Component state
  // rather than the draft store, because it is a question being asked right
  // now and not something the message carries.
  //
  // EVERY miss, not the first: a message carries as many skills as its text
  // names, so "check /audit then /map this" holds two, and a question about
  // one of them sends the other in silence.
  //
  // These spans are what the notice RENDERS and nothing more. They are not
  // handed back to the decision, which walks the draft itself on every path,
  // so a list left behind by a draft that has moved can mis-word a notice but
  // can no longer mis-rewrite a message. Clearing it on an edit or a pick is
  // therefore about the screen telling the truth, not about a module
  // invariant.
  const [misses, setMisses] = useState<readonly SkillNearMiss[]>([])
  // Where the caret goes once a completion has been written into the field,
  // handed to the field and cleared the moment it lands. A completion that
  // reaches the end of the draft would get the same offset from the value
  // assignment alone; one with prose behind it — a menu pick made back inside
  // a sentence, or the near-miss rewrite — would not, and its reader would be
  // thrown to the end of a sentence they were standing in the middle of.
  const [caret, setCaret] = useState<number | null>(null)
  // Where the reader's selection IS, with the text it was read from — the
  // other half of the caret. The request above is where a write puts the
  // caret; this is where the caret stands, which is what the skill lookup
  // reads. The text rides along because an offset belongs to one string: a
  // draft written from somewhere this panel did not report (a send clearing
  // the field, a restored session) leaves it describing text that is gone,
  // and the lookup falls back to the end of the draft rather than trust it.
  const [selection, setSelection] = useState<FieldSelection | null>(null)
  // The slash menu is a portalled popover; this is what it anchors to (and
  // what --anchor-width measures).
  const composerRowRef = useRef<HTMLDivElement>(null)
  // Reopening a session after a reload restores its transcript from
  // agent_messages (no-op for never-persisted sessions). Asking before the
  // panel above has attached persistence is fine and is the ordinary case on
  // a reload: the ask is parked and runs when a client lands, so this effect
  // depends on the session and nothing else.
  useEffect(() => {
    hydrateAgentTranscript(session.id)
  }, [session.id])

  // React-side context. What the user is *looking at* (view, selection,
  // open panel, Design picks) comes from the UI-context bridge, collected
  // live per round in the loop — this covers the rest: posture, filters,
  // and the session's edit history.
  const contextNote = useMemo(() => {
    const lines: string[] = [
      `Canvas mode: ${mode}${mode === 'design' ? ' (authoring)' : ' (read-only posture)'}`,
    ]
    if (activePathKeys.length > 0)
      lines.push(`Visible path variants: ${activePathKeys.join(', ')}`)
    const recent = [...changes].reverse().slice(0, 5)
    if (recent.length > 0) {
      lines.push(
        'Recent changes this browser session, newest first (get_change_history has all):',
        ...recent.map(
          (entry) =>
            `- ${entry.author === 'agent' ? 'agent' : 'user'}: ${describeChange(entry)}`,
        ),
      )
    }
    return lines.join('\n')
  }, [activePathKeys, changes, mode])

  // A slash that opens a word starts a skill lookup, wherever in the draft
  // it sits — the rule and the spans it reports live in skills.ts, because
  // the strings it must NOT fire on (a reference path, a URL, `and/or`, a
  // date) are worth a table of tests and not a condition in a render body.
  //
  // At the CARET: the lookup is the token the caret sits at the end of, so a
  // slash typed back into a sentence opens the menu where it was typed. A
  // selected range is not a caret, and opens nothing.
  const lookupCaret =
    selection?.text === draft
      ? selection.start === selection.end
        ? selection.start
        : null
      : draft.length
  const slashLookup =
    lookupCaret === null ? null : findSkillLookup(draft, lookupCaret)
  const slashMatches = slashLookup
    ? AGENT_SKILL_COMMANDS.filter((command) =>
        skillMatchesQuery(command, slashLookup.query),
      )
    : []
  // Dismissal is the one fact about the menu the draft cannot carry: the
  // reader wants the token they typed to stay typed AND the menu gone, and
  // the draft that opened the menu is still the draft. It is cleared by the
  // next keystroke or the next caret move, so the menu is never shut for a
  // token the reader has not seen it open on.
  const [slashDismissed, setSlashDismissed] = useState(false)
  const slashOpen = slashMatches.length > 0 && !slashDismissed
  // Arrow keys and hover move one highlight through the *pickable* matches
  // (cmdk drives hover via onValueChange; the arrows below drive the rest).
  // Derived-with-a-guard, the house pattern: as typing reshapes the matches,
  // a highlight that fell out of them snaps back to the first pickable one.
  const slashPickable = slashMatches.filter((command) => command.content)
  const [slashHighlight, setSlashHighlight] = useState('')
  const nextHighlight = slashPickable.some(
    (command) => command.id === slashHighlight,
  )
    ? slashHighlight
    : (slashPickable[0]?.id ?? '')
  if (slashOpen && nextHighlight !== slashHighlight) {
    setSlashHighlight(nextHighlight)
  }
  const moveSlashHighlight = (delta: number) => {
    if (slashPickable.length === 0) return
    const index = slashPickable.findIndex(
      (command) => command.id === nextHighlight,
    )
    const next =
      slashPickable[
        (index + delta + slashPickable.length) % slashPickable.length
      ]
    setSlashHighlight(next.id)
  }

  // A write from here — a pick, an accepted offer — puts the caret itself, so
  // the selection it leaves is recorded with it rather than waited for: the
  // lookup reads it on the very next render, and a stale one would reopen the
  // menu on the token just written. One helper for the three, so a write
  // cannot place the caret and forget the selection.
  const writeDraft = (text: string, at: number) => {
    setDraft(text)
    setCaret(at)
    setSelection({ text, start: at, end: at })
  }

  // Accepting a match COMPLETES the token in place — `/ub:aud` becomes
  // `/ub:audit `, exactly where the reader typed it, the way a shell
  // completion behaves. It neither clears the field nor removes the token: the
  // first ate the sentence a reader was half-way through, and the second
  // moved their word to the front of the message as a badge. The rewrite
  // itself is in skills.ts, with the spans it works on.
  const pickSkill = (command: AgentSkillCommand) => {
    if (!command.content || !slashLookup) return
    setMisses([])
    const completed = completeSkillToken(draft, slashLookup, command)
    writeDraft(completed.text, completed.caret)
  }

  /**
   * No answer can start a send at all while a run is in flight, or on a
   * signed-out board that is not the sample trial. The trial runs with NO
   * client on purpose — sample reads, no writes — so the absent client is a
   * refusal only outside it.
   */
  const sendBlocked = running || (!client && !isSampleTrial)

  /**
   * DECIDE, then carry the decision out. `decideSend` says what the draft and
   * this answer mean — the next question, or the Send; everything here is the
   * carrying out, which is the part the module has no business knowing: an
   * annotation on the shelf, the store the draft lives in, and the dispatch.
   *
   * It used to be three closures here and an ordering contract written
   * nowhere, and the step a caller could drop was the re-check: accepting one
   * offer sent straight out, so a second near miss in the same message rode
   * along in silence. There is no step to drop now — an accepted answer comes
   * back as the next question when there is one.
   *
   * The blocked check comes BEFORE the decision, and that ordering is the
   * whole of a defect this used to have. It sat after the rewrite instead, so
   * accepting an offer while a run was in flight rewrote the field, dropped
   * the send on the floor, and left the notice on screen still holding the
   * spans of the draft that had just moved — and the next click completed a
   * token against offsets that no longer pointed at it, turning `/audit` into
   * `/ub:audit dit `. Deciding nothing when nothing can be sent means the
   * draft and the notice stay in agreement.
   */
  const resolveSend = (answer: SendAnswer) => {
    if (sendBlocked) return
    const decision = decideSend(draft, answer)
    if (decision.kind === 'ask') {
      // The rewrite an accepted offer produced, put back in the field with
      // the question it goes with — one update, so the reader never sees a
      // notice describing text the field has already left behind.
      //
      // The accepted token is mid-sentence by construction — it has the rest
      // of the draft behind it — so the caret the rewrite reports is the one
      // thing the field cannot work out for itself.
      if (decision.caret !== null) writeDraft(decision.draft, decision.caret)
      else if (decision.draft !== draft) setDraft(decision.draft)
      setMisses(decision.misses)
      return
    }
    let text = decision.send.text
    const attached = takePendingAgentAttachment()
    // An empty draft with an annotation on the shelf still has something to
    // say, and the shelf is the one thing the decision cannot see.
    if (!text && attached) text = 'Here are my canvas annotations.'
    if (!text) {
      // Nothing usable to send — put a taken attachment back on the shelf.
      if (attached) setPendingAgentAttachment(attached)
      return
    }
    setMisses([])
    clearAgentDraft(session.id)
    void sendToAgent({
      client,
      sessionId: session.id,
      offlineBoard,
      settings,
      contextNote,
      text,
      skills: decision.send.skills,
      declaredMisses: decision.declaredMisses,
      attachment: attached,
      allowWrites: canAgentWrite,
    })
  }

  /**
   * Pressing Send answers for the misses on screen, if any: the reader has
   * read the question and pressed again, so the message means itself and
   * every miss in it is declared. With nothing on screen the press is the
   * first ask, and the two are different answers rather than one answer with
   * an empty list.
   */
  const send = () =>
    resolveSend({ kind: misses.length > 0 ? 'declared' : 'unasked' })

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-agent-panel="chat">
      {/* Header: back + title + change count. Nothing else — the
          transcript owns the rest of the height. */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-muted px-2">
        <IconTooltip label="Back to sessions" side="bottom">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Back to sessions"
            className="text-muted-foreground hover:text-foreground"
            onClick={onBack}
          >
            <ChevronLeft className="size-3.5" aria-hidden />
          </Button>
        </IconTooltip>
        {/* The title is editable in place — auto-names are a default, not
            a decision. */}
        <button
          type="button"
          onClick={() => setRenaming(true)}
          title="Rename session"
          className="group/title flex min-w-0 flex-1 items-center gap-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            {session.title}
          </span>
          <Pencil
            className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--motion-micro) ease-arrive motion-reduce:transition-none group-hover/title:opacity-100"
            aria-hidden
          />
        </button>
        {changeCount > 0 ? (
          <ChangeCount count={changeCount} className="text-muted-foreground" />
        ) : null}
      </div>

      {isSampleTrial ? <AgentTrialBanner /> : null}

      {/* MessageScroller owns the hard parts: anchored turns, streamed
          replies, jump-to-latest. */}
      <MessageScrollerProvider>
        <MessageScroller className="relative min-h-0 flex-1">
          {/* One rhythm: the viewport's p-3 is the transcript's gutter and
              the composer's too, so both columns share a left edge; rows sit
              on a gap-3 baseline and a NEW user turn opens a wider gap, so
              turns read as turns without a second bubble treatment. */}
          <MessageScrollerViewport className="p-3">
            <MessageScrollerContent className="gap-3">
              {events.length === 0 ? (
                transcriptHydrating ? (
                  // A persisted conversation is still on the wire —
                  // skeleton bubbles, not the "Ready" copy, which read as
                  // the agent having no loading state at all.
                  <div className="flex flex-col gap-3" aria-hidden>
                    <Skeleton className="ml-auto h-8 w-3/5 rounded-full" />
                    <Skeleton className="h-8 w-4/5 rounded-full" />
                    <Skeleton className="h-8 w-2/5 rounded-full" />
                  </div>
                ) : keyed ? (
                  isSampleTrial ? (
                    <p className="text-sm text-muted-foreground">
                      Ready ({modelFor(settings)}). Ask about the sample
                      blueprint — reading and navigation only.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ready ({modelFor(settings)}). Writes land live on the
                      canvas as{' '}
                      <Sparkles
                        className="inline size-3 align-[-0.1em]"
                        aria-hidden
                      />{' '}
                      rows in Changes — each revertible.
                    </p>
                  )
                ) : (
                  <div className="flex flex-col items-start gap-2">
                    <p className="text-sm text-muted-foreground">
                      No provider key yet — the key stays in this browser only.
                    </p>
                    <Button size="xs" variant="outline" onClick={openAgentSettings}>
                      Add API key…
                    </Button>
                  </div>
                )
              ) : (
                // Index keys are safe here: the transcript is append-only.
                // Finished step runs fold into an accordion; the live tail
                // (last block while running) always renders expanded so
                // streaming stays visible.
                blockTranscript(events).map((block, blockIndex, blocks) => {
                  const isLastBlock = blockIndex === blocks.length - 1
                  if (block.kind === 'steps' && !(running && isLastBlock)) {
                    return (
                      <MessageScrollerItem
                        key={`steps-${block.start}`}
                        scrollAnchor={!running && isLastBlock}
                      >
                        <TranscriptStepsBlock events={events} run={block} />
                      </MessageScrollerItem>
                    )
                  }
                  const indices =
                    block.kind === 'steps'
                      ? Array.from(
                          { length: block.end - block.start + 1 },
                          (_, i) => block.start + i,
                        )
                      : [block.index]
                  return indices.map((index) => {
                    const event = events[index]
                    return (
                      <MessageScrollerItem
                        key={index}
                        // While a run streams, the working row below is the
                        // anchor — otherwise the last event is.
                        scrollAnchor={!running && index === events.length - 1}
                        className={cn(
                          event.kind === 'user' && index > 0 && 'mt-3',
                        )}
                      >
                        {/* Chat replies never fold — only completed
                            tool/status step runs do (TranscriptStepsBlock). */}
                        <TranscriptRow event={event} />
                      </MessageScrollerItem>
                    )
                  })
                })
              )}
              {/* A transcript row, not a loose glyph: it keeps the list's
                  rhythm, and it announces itself instead of spinning in
                  silence. */}
              {running ? (
                <MessageScrollerItem scrollAnchor>
                  <Marker role="status" aria-live="polite">
                    <MarkerIcon>
                      <Loader2 className="animate-spin" aria-hidden />
                    </MarkerIcon>
                    <MarkerContent>Working…</MarkerContent>
                  </Marker>
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <RenameSessionDialog
        session={renaming ? session : null}
        onRename={renameAgentSession}
        onOpenChange={(open) => {
          if (!open) setRenaming(false)
        }}
      />

      {/* No border-t: the field draws its own edge, and a rule immediately
          above it read as a second line stacked on the first. The viewport's
          scroll fade already says "the transcript continues up there". */}
      <div className="shrink-0 p-3 pt-2">
        {attachment ? (
          <div className="mb-2 flex flex-col gap-2">
            {attachment ? (
              <Attachment size="sm" className="w-full">
                <AttachmentContent>
                  <AttachmentTitle className="text-sm">
                    {attachment.label}
                  </AttachmentTitle>
                  <AttachmentDescription className="text-xs">
                    {attachment.lines.join(' · ')}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label="Remove attachment"
                    onClick={() => setPendingAgentAttachment(null)}
                  >
                    <X className="size-3" aria-hidden />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ) : null}
          </div>
        ) : null}
        {misses.length > 0 ? (
          /* The one thing that must not happen silently: a token that LOOKS
             like an invocation, spells only a skill's bare name, and runs
             nothing. Two choices and no default — running a skill off a
             spelling that does not invoke is as wrong as dropping one the
             reader meant. Accepting rewrites the token where it sits, so the
             reader can see in the text what they agreed to.

             EVERY miss is named in the sentence, because a message carries as
             many skills as its text names: "check /audit then /map this" is
             two, and a notice that mentioned one of them made the other one's
             silence look answered. Both buttons are one answer handed to the
             same call, and it is the call that decides whether the answer
             sends or asks again — the accepted rewrite fixes one token and
             can leave another standing, and the next miss asks in its turn
             rather than riding out on the accept. */
          <div
            role="status"
            className="mb-2 flex flex-col gap-2 rounded-lg border border-muted bg-muted/40 p-2"
          >
            <p className="text-xs text-muted-foreground">
              {misses.length === 1
                ? `“/${misses[0].token}” is not a skill name — the closest match is ${misses[0].command.label}.`
                : `${misses.map((miss) => `“/${miss.token}”`).join(' and ')} are not skill names — the closest matches are ${misses.map((miss) => miss.command.label).join(' and ')}. One at a time.`}
            </p>
            {/* Both answers are dead while nothing can be sent. A live
                button here is not merely a press that does nothing: the
                accept rewrites the draft on its way to a send that is then
                refused, and the reader is left looking at a notice about
                text that has moved. Greying them says what is true — the
                question is still open, and it keeps until the run is. */}
            <div className="flex gap-2">
              <Button
                size="xs"
                variant="default"
                disabled={sendBlocked}
                onClick={() => resolveSend({ kind: 'accepted' })}
              >
                Run {misses[0].command.label}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={sendBlocked}
                onClick={send}
              >
                Send as text
              </Button>
            </div>
          </div>
        ) : null}
        {/* The slash menu: type "/" to see the four skills — the same
            SKILL.md files IDE agents run, minus their file mechanics.
            PORTALLED, anchored to the composer row. Two reasons, both
            defects it used to cause as an absolutely-positioned child:
            cmdk scrolls the highlighted item into view on every value
            change, and scrollIntoView walks EVERY scrollable ancestor —
            an overflow:hidden box included — which was silently scrolling
            the dock chrome and the sidebar aside; and a fixed w-72 menu
            does not fit a 272px docked panel, so it got clipped. A portal
            has no hidden-overflow ancestors, and --anchor-width sizes it
            to the field. */}
        <Popover
          open={slashOpen}
          // Derived from the draft and one dismissal flag, and from nothing
          // else: an outside press is a no-op rather than a state that
          // disagrees with what is typed. Escape is handled in the textarea,
          // where it sets that flag and leaves the text alone.
          onOpenChange={() => undefined}
        >
          <PopoverContent
            anchor={composerRowRef}
            side="top"
            align="start"
            sideOffset={6}
            // The textarea keeps focus the whole time — it is still the
            // thing being typed into, and the arrow keys live there.
            initialFocus={false}
            finalFocus={false}
            className="w-(--anchor-width) max-w-(--available-width) gap-0 p-1"
            aria-label="Agent skills"
          >
            {/* The composer's textarea keeps focus and does the typing, so
                the Command runs headless: filtering stays ours (the same
                skillMatchesQuery the send path uses → shouldFilter=false)
                and selection is controlled, fed by the arrow keys in the
                textarea's onKeyDown and by cmdk's own hover tracking. The
                popup already supplies the surface and the radius, so the
                Command contributes neither. */}
            <Command
              shouldFilter={false}
              value={nextHighlight}
              onValueChange={setSlashHighlight}
              className="rounded-lg! bg-transparent p-0"
            >
              <CommandList>
                {slashMatches.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={command.id}
                    disabled={!command.content}
                    onSelect={() => pickSkill(command)}
                    size="sm"
                    className="items-baseline gap-2 text-sm"
                  >
                    <span className="shrink-0 font-mono text-foreground">
                      {command.label}
                    </span>
                    <span className="min-w-0 flex-1 text-muted-foreground">
                      {command.summary}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <div ref={composerRowRef} className="flex items-end gap-2">
          {running ? (
            <IconTooltip label="Stop — whatever landed stays, revertible">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                aria-label="Stop"
                onClick={() => stopAgent(session.id)}
              >
                <Square className="size-3" aria-hidden />
              </Button>
            </IconTooltip>
          ) : null}
          {/* ONE field, the DS's own: the input group draws the border and
              the focus treatment (a single soft ring on the control, the same
              geometry every other input in the app has), and the recognised
              token is COLOURED where it was typed. Both of those, and the
              five-way agreement the colour depends on, are ComposerInkedField's
              — this panel hands it the draft and the keys, and cannot reach
              the box the field and its mirror measure nor hand in token
              offsets read off some other string. The badge row that used to
              sit in an add-on here is gone: it lifted the token out of the
              prose and stood it at the front of the message. */}
          <ComposerInkedField
            draft={draft}
            caret={caret}
            onCaretPlaced={() => setCaret(null)}
            onSelectionChange={(next) => {
              // A caret moved is a new question about whatever token it now
              // sits at, so a dismissal of the last one does not carry over.
              // React reports a select on every key-up and mouse-up, moved
              // or not; an unmoved one is no news and costs a render.
              if (
                next.text === selection?.text &&
                next.start === selection.start &&
                next.end === selection.end
              )
                return
              if (slashDismissed) setSlashDismissed(false)
              setSelection(next)
            }}
            onDraftChange={(value) => {
              // The question was about the draft as it stood; editing it is
              // an answer to neither choice, so it goes away.
              if (misses.length > 0) setMisses([])
              // A dismissal answers for the draft that was on screen; the
              // next keystroke is a new draft, and the menu is free again.
              if (slashDismissed) setSlashDismissed(false)
              setDraft(value)
            }}
            onKeyDown={(event) => {
              // While an IME composes, Enter confirms its candidate and the
              // arrows walk its list: the keystroke is the IME's, and neither
              // a pick nor a send.
              if (event.nativeEvent.isComposing) return
              if (slashOpen && event.key === 'ArrowDown') {
                event.preventDefault()
                moveSlashHighlight(1)
                return
              }
              if (slashOpen && event.key === 'ArrowUp') {
                event.preventDefault()
                moveSlashHighlight(-1)
                return
              }
              if (
                slashOpen &&
                (event.key === 'Enter' || event.key === 'Tab') &&
                // Shift+Enter stays a newline even mid-menu — same
                // exemption the closed-menu send path makes below.
                !event.shiftKey
              ) {
                event.preventDefault()
                const highlighted = slashPickable.find(
                  (command) => command.id === nextHighlight,
                )
                if (highlighted) pickSkill(highlighted)
                return
              }
              if (slashOpen && event.key === 'Escape') {
                // Mark the event consumed: the canvas selection listener
                // skips defaultPrevented Escapes, and closing this menu
                // must not also wipe a cell selection.
                event.preventDefault()
                // The menu closes and the draft is UNTOUCHED. Escape used
                // to clear the field, which was invisible while a draft
                // could only ever be "/aud" and is text deletion with no
                // undo the moment a sentence surrounds the token.
                setSlashDismissed(true)
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
            placeholder={
              keyed
                ? 'Message the agent… ("/" for skills)'
                : 'Add an API key in agent settings first'
            }
            disabled={!keyed}
          />
          <IconTooltip label="Send">
            <Button
              type="button"
              size="icon-sm"
              variant="default"
              aria-label="Send"
              disabled={
                !keyed || sendBlocked || (draft.trim() === '' && !attachment)
              }
              onClick={send}
            >
              <SendHorizontal className="size-3.5" aria-hidden />
            </Button>
          </IconTooltip>
        </div>
      </div>
    </div>
  )
}
