import {
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from 'react'
import { InputGroup, InputGroupTextarea } from '@/components/ui/input-group'
import { COMPOSER_FIELD_METRICS } from '@/components/editor/agent/composerFieldMetrics'
import { findSkillTokens, type SkillTokenSpan } from '@/lib/agent/skills'
import { cn } from '@/lib/utils'

/**
 * The agreement, resolved ONCE for both copies of the draft, and reachable
 * from nowhere else.
 *
 * This is why the two class lists cannot drift apart: there is no second place
 * either of them is built, and no second place either of them can be READ, so
 * a metric cannot be spelled onto the field by an edit that never learns the
 * mirror exists and a second mirror cannot be assembled outside this module
 * from the same call.
 *
 * `mirroring` is the transparency toggle. The field hands the drawing over
 * only while the mirror is actually up: transparent text with nothing behind
 * it is an empty composer, and a preedit string an IME is still composing
 * lives in the field and nowhere else.
 *
 * `relative` on the field is not cosmetic either: the mirror is absolutely
 * positioned and would paint over a static sibling however early it sits in
 * the tree, hiding the caret the reader is aiming with. The selection band is
 * translucent for the same stacking reason — an opaque one would cover the
 * only copy of the text a reader can see.
 */
function composerFieldClasses(mirroring: boolean): {
  field: string
  mirror: string
} {
  return {
    field: cn(
      COMPOSER_FIELD_METRICS,
      'relative selection:bg-primary/25',
      mirroring && 'text-transparent caret-foreground',
    ),
    mirror: cn(
      COMPOSER_FIELD_METRICS,
      'pointer-events-none absolute inset-0 overflow-hidden select-none',
    ),
  }
}

/**
 * The reader's prose, drawn behind the field, with every token that names a
 * skill coloured where they typed it.
 *
 * Colour is the whole signal. Nothing else on this surface says a skill is
 * attached, because nothing else records one — a coloured token will run, and
 * an uncoloured one is a word with a slash on it. The alternative shipped
 * first and was rejected: a badge row above the field, which took the token
 * out of the sentence and stood it at the front of the message.
 *
 * `--text-primary` is the ink: the role this app acts in — the same role the
 * send button wears — on a neutral ground, which is what "recognised, and
 * about to act" means in the token vocabulary. Not a hue and not a new
 * variable; the token model is the only style seam there is.
 *
 * Colour and nothing else, deliberately. A wash behind the token and a
 * heavier weight were both tried and dropped: the reader asked for the
 * treatment the tool this composer mirrors uses, which is coloured text with
 * no band and no box around it.
 *
 * The template's teal makes this a coloured token in both themes: the hue is
 * what sets it apart from the grey prose around it. A fork that sets
 * `--primary-chroma: 0` loses the hue, and then the only axis left is
 * lightness — a shade LIGHTER than the words around it in light and a shade
 * DARKER in dark. Worth knowing before anyone reaches for a step in lightness
 * in one direction and finds it is the wrong direction in the other theme;
 * the signal is the difference, not which way it goes.
 *
 * The trailing newline is not decoration. A block collapses the last newline
 * of its content and a textarea renders a line for it, so a message ending in
 * Enter leaves the two with different scroll heights and the scroll sync below
 * lands a line off at the bottom of a long draft.
 */
function ComposerMirror({
  draft,
  tokens,
  className,
  ref,
}: {
  draft: string
  tokens: readonly SkillTokenSpan[]
  className: string
  ref: Ref<HTMLDivElement>
}) {
  const parts: ReactNode[] = []
  let at = 0
  for (const span of tokens) {
    if (span.start > at) parts.push(draft.slice(at, span.start))
    parts.push(
      <span key={span.start} className="text-text-primary">
        {draft.slice(span.start, span.end)}
      </span>,
    )
    at = span.end
  }
  parts.push(draft.slice(at))
  return (
    <div aria-hidden data-slot="composer-mirror" className={className} ref={ref}>
      {parts}
      {'\n'}
    </div>
  )
}

/**
 * The two facts this module owns outright and a caller supplies: the draft,
 * and where a keystroke writes back to.
 *
 * The tokens are NOT among them, and that is deliberate. They are read out of
 * the draft in here, because tokens handed in alongside it are a second
 * record of the same fact and the two can be computed from different strings
 * — spans at offsets the field's text does not have, so the mirror colours
 * the wrong characters and the colour drifts off the caret. That is the exact
 * failure this module exists to make unexpressible, and a caller that wants
 * the same tokens for a menu of its own calls the same pure function.
 */
type ComposerInkedFieldOwnProps = {
  draft: string
  onDraftChange: (text: string) => void
  /**
   * Where to put the caret once this draft is on screen, or null to leave it
   * where the browser put it. A one-shot request, not a stored position: the
   * field reports back through `onCaretPlaced` and expects the caller to
   * clear it, so the next keystroke is not yanked back to an old offset.
   *
   * It exists because a controlled textarea gets its text through an
   * assignment to `value`, which drops the caret at the end of the new text.
   * That is the right place for a completion whose token reaches the end of
   * the draft and the wrong one for a token rewritten mid-sentence, where
   * the reader had prose after the word they just completed.
   */
  caret: number | null
  /** Called once the request above has been carried out. */
  onCaretPlaced: () => void
  /**
   * Where the reader's selection is, with the text it was read from — on
   * every keystroke and every caret move, arrow key or click alike. The text
   * travels with the offsets because an offset means nothing against any
   * other string: a caller holding one across a draft written from elsewhere
   * can see it no longer belongs.
   */
  onSelectionChange: (selection: FieldSelection) => void
}

/** The field's selection, and the text it is an offset into. */
export type FieldSelection = { text: string; start: number; end: number }

/**
 * The textarea props this module SPENDS rather than passes on. Every one of
 * them is a rung of the illusion, so leaving it reachable is leaving a way to
 * break it from outside: `value`/`onChange`/`onSelect` are the draft and
 * selection seam above, `className` carries the metrics both copies wear,
 * `ref`/`onScroll` and the composition pair are the scroll sync and the IME
 * stand-down, `rows` is the one-line floor the growth starts from, and
 * `aria-label` is the name the focus seam and every reader find the field by.
 * Omitted from the passthrough so overriding one is a compile error rather
 * than a comment nobody reads.
 */
type ComposerFieldOwnedProps =
  | 'aria-label'
  | 'children'
  | 'className'
  | 'onChange'
  | 'onCompositionEnd'
  | 'onCompositionStart'
  | 'onScroll'
  | 'onSelect'
  | 'ref'
  | 'rows'
  | 'value'

/**
 * THE COMPOSER'S FIELD, with the mirror that colours a skill token in it.
 *
 * One module, because the illusion is one fact split five ways and every one
 * of the five is a way for it to break. A textarea cannot colour a word
 * inside itself, so the colour comes from a mirrored copy of the same string
 * drawn behind a field whose own text has gone transparent — and that picture
 * holds only while the two copies agree on: the metrics that decide a line
 * break, the trailing newline a block would otherwise collapse, the ONE
 * positioned box they both size against, the scroll offset, and standing down
 * while an IME composes. Four of those used to be the caller's to get right,
 * spelled in its render body next to everything else a chat panel does, with
 * a comment asking the next reader not to break them.
 *
 * What the narrow interface buys is that the comment is no longer the
 * mechanism. Callers hand in the draft, the write-back and whatever a
 * textarea takes; they cannot reach the box the two copies measure, they
 * cannot hand in tokens read off some other string, and they cannot put an
 * add-on into the input group, because the group is in here and takes no
 * children from outside. That was the live hazard: an add-on in the group
 * narrows the FIELD through the group's own `has-[>[data-align=...]]` rules
 * and leaves the mirror full width, so every line from the first wrap down
 * breaks somewhere else and the colour drifts off the caret — a failure no
 * shared metrics string can see or undo. Inside this module the add-on would
 * land beside the box that sizes both copies, which narrows both or neither.
 *
 * `h-auto` on the group is the other half of that box's cost, and it is load
 * bearing: the group grows for a DIRECT-child textarea
 * (`has-[>textarea]:h-auto`), and the field is a grandchild of it here, so
 * the height that lets the composer pass one line is spelled rather than
 * inferred. Drop it and a draft that wraps is typed into a 28px slot with its
 * first line scrolled out of sight.
 *
 * `field-sizing-content` on the DS textarea is what actually grows it, so
 * there is no imperative height write anywhere in here; the metrics string's
 * `max-h-30` caps the growth at roughly six lines and the field scrolls from
 * there, which is what the scroll sync exists for.
 *
 * The metrics string itself lives in `composerFieldMetrics.ts` beside this
 * file, and it is the one thing that crosses out: a test needs the list of
 * properties the two copies must agree on, and a file exporting a constant
 * beside a component is what the fast-refresh rule refuses. The pair of class
 * lists it spreads onto is built above and goes nowhere.
 */
export function ComposerInkedField({
  draft,
  onDraftChange,
  caret,
  onCaretPlaced,
  onSelectionChange,
  ...passthrough
}: Omit<
  ComponentPropsWithoutRef<typeof InputGroupTextarea>,
  keyof ComposerInkedFieldOwnProps | ComposerFieldOwnedProps
> &
  ComposerInkedFieldOwnProps &
  // A composer with no prompt in it is a box; the primitive's own type says
  // what a placeholder is, so only its being required is stated here.
  Required<
    Pick<ComponentPropsWithoutRef<typeof InputGroupTextarea>, 'placeholder'>
  >) {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  // The skills this message names, read out of the draft and nowhere else —
  // the same reading the panel's menu makes, from the same function, so there
  // is no second string the offsets could belong to.
  const tokens = findSkillTokens(draft)
  // The mirror's overflow is hidden, so it is scrolled from here rather than
  // by the reader: a message past six lines scrolls the field, and a mirror
  // left at the top would show the first line's colour against the sixth
  // line's text.
  const syncMirrorScroll = () => {
    const field = fieldRef.current
    const mirror = mirrorRef.current
    if (!field || !mirror) return
    mirror.scrollTop = field.scrollTop
    mirror.scrollLeft = field.scrollLeft
  }
  // A keystroke at the bottom of a scrolled field moves its scrollTop without
  // ever firing a scroll event in time to matter, so the sync also runs after
  // the write that caused it — before paint, or the colour lags a frame behind
  // the caret on every character typed.
  useLayoutEffect(syncMirrorScroll, [draft])
  // A caret write has to come AFTER the commit that wrote the text, which is
  // what makes it a layout effect rather than something a click handler does
  // for itself: React assigns `value` during the commit, and that assignment
  // moves the caret to the end of the new text however carefully a handler
  // placed it beforehand.
  //
  // Focus goes with it, and not as a courtesy — the gesture that needs a
  // caret is a press on a button, so the field has just lost focus, and a
  // caret in an unfocused textarea is a position nobody is typing at.
  useLayoutEffect(() => {
    if (caret === null) return
    const field = fieldRef.current
    if (!field) return
    field.focus()
    field.setSelectionRange(caret, caret)
    onCaretPlaced()
  })
  const reportSelection = (field: HTMLTextAreaElement) =>
    onSelectionChange({
      text: field.value,
      start: field.selectionStart,
      end: field.selectionEnd,
    })
  // Composition text lives in the field, and the field's own text is
  // transparent while the mirror behind it is doing the drawing — so an IME
  // preedit string would be invisible for as long as it is being composed.
  // While composing, the field shows its own text and the mirror stands down.
  const [composing, setComposing] = useState(false)
  const mirroring = tokens.length > 0 && !composing
  const classes = composerFieldClasses(mirroring)
  return (
    <InputGroup className="h-auto min-h-8 flex-1">
      {/* ONE positioned box, sized by the field: that is what keeps the two
          copies wrapping alike, since the mirror is `absolute inset-0` and
          measures its nearest positioned ancestor. The module docblock above
          says what goes wrong when that ancestor is the group instead. */}
      <div className="relative min-w-0 flex-1">
        {mirroring ? (
          <ComposerMirror
            ref={mirrorRef}
            draft={draft}
            tokens={tokens}
            className={classes.mirror}
          />
        ) : null}
        <InputGroupTextarea
          {...passthrough}
          ref={fieldRef}
          // The seam `focusAgentComposer` finds this by. The phone's shell
          // gives the caret back here after an agent-driven camera move, so
          // the reader keeps typing without hunting for the box.
          data-agent-composer=""
          rows={1}
          className={classes.field}
          value={draft}
          onScroll={syncMirrorScroll}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onChange={(event) => {
            reportSelection(event.target)
            onDraftChange(event.target.value)
          }}
          onSelect={(event) => reportSelection(event.currentTarget)}
          aria-label="Message the agent"
        />
      </div>
    </InputGroup>
  )
}
