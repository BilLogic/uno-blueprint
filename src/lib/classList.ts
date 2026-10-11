import {
  type Surface,
  sourceOf,
  stripComments,
  strippedSourcesOn,
} from '@/lib/sourceTree'

/**
 * A class list, not a class string.
 *
 * A type rule is almost never about one utility. "Labels are medium" is
 * `text-xs` + `font-medium` together; "an eyebrow is register 3" is
 * `font-mono` + `uppercase` + `tracking-*` together. The quoted-string
 * splitter in `tokenModel` cannot answer "does this call site contain these
 * classes": it yields one utility at a time, and a substring search for the
 * token's own string is defeated the moment the classes are reordered or
 * split across `cn()` arguments.
 *
 * This module is the seam those guards are written with. It reads a class
 * list however the tree spelled it — a single string, across `cn()`
 * arguments, inside a conditional — and answers whether every class of a
 * token is present, in any order. It enforces no rule of its own.
 */

/**
 * Values `cn()` accepts: a whitespace-separated class string, a nested list
 * of the same, or a falsey skip.
 */
export type ClassListInput =
  | string
  | false
  | null
  | undefined
  | readonly ClassListInput[]

/**
 * A class list as written at one call site.
 */
export type ClassListSite = {
  /** Path relative to `src` when found by walking the tree. */
  file: string
  /** 1-based line where the list opens. */
  line: number
  /** Utilities on this site, first-seen order, duplicates dropped. */
  classes: string[]
}

/**
 * Normalise a class list into unique utilities, first-seen order.
 *
 * A string splits on whitespace. Falsey values drop the way `cn()` drops
 * them. Nested arrays flatten. Duplicates keep the first occurrence so a
 * later guard can ask "is this class in the list" without caring how the
 * author spelled the call.
 */
export function classListOf(input: ClassListInput): string[] {
  const classes: string[] = []
  const seen = new Set<string>()
  const push = (token: string) => {
    if (!token || seen.has(token)) return
    seen.add(token)
    classes.push(token)
  }
  const walk = (value: ClassListInput) => {
    if (value === false || value === null || value === undefined) return
    if (typeof value === 'string') {
      for (const token of value.split(/\s+/)) push(token)
      return
    }
    for (const entry of value) walk(entry)
  }
  walk(input)
  return classes
}

/**
 * True iff every class of `tokenClasses` is present in `classes`, in any order.
 *
 * Presence, not adjacency and not sequence: the sequence badge writes
 * `font-mono` then size and weight then `tabular-nums`, and a token that
 * names the first and the last is still on that site.
 */
export function classListHas(
  classes: ClassListInput,
  tokenClasses: ClassListInput,
): boolean {
  const present = new Set(classListOf(classes))
  return classListOf(tokenClasses).every((token) => present.has(token))
}

/**
 * Every class list written in `source`.
 *
 * Three spellings, and all three are one list:
 *
 * 1. a quoted `className="a b c"`
 * 2. `cn('a b', 'c')` — split across arguments
 * 3. `cn('a', cond && 'b')` — a class inside a conditional still belongs
 *    to the call site, because a guard asks whether the site *contains*
 *    these classes, not whether it always applies them
 *
 * Named constants (`CANVAS_HEADER_TEXT`, `MONO_NUM_CLASS`) expand when the
 * same source declares them, or when `names` carries a table built from
 * the rest of the tree.
 */
export function classListsIn(
  source: string,
  file = '',
  names?: ReadonlyMap<string, readonly string[]>,
): ClassListSite[] {
  const code = stripComments(source)
  const resolved = new Map<string, readonly string[]>(names ?? [])
  for (const [name, classes] of namedClassListsIn(code)) {
    resolved.set(name, classes)
  }
  return extractSites(code, file, resolved)
}

/**
 * Every class list written on a surface of the application.
 *
 * Sampling is the one reading in `lib/sourceTree.ts` — the whole of the
 * application, comments stripped, tests excluded — so a guard written against
 * this reader and a guard written against the token model are looking at the
 * same tree, because there is only one tree being read.
 *
 * `surface` narrows WHERE THE SITES COME FROM and nothing else. The named
 * class-list constants are always resolved across the whole application:
 * `cn(CANVAS_HEADER_TEXT, 'truncate')` on the editor surface is the named list
 * plus `truncate` whichever file declares the name, and a table built from the
 * surface alone would silently report the extra class on its own — a narrowing
 * that looks like a pass. Default is the whole application, which is what
 * every caller before surfaces meant.
 */
export function classLists(surface: Surface = 'app'): ClassListSite[] {
  return strippedSourcesOn(surface).flatMap((file) =>
    extractSites(file.code, file.file, namedClassLists()),
  )
}

/**
 * Every `leading-*` in `file` whose line — or the comment immediately above it
 * — does not name the geometry that needs the override.
 *
 * Here rather than in the two type ladder guards that ask it because it was written twice,
 * byte for byte, and the only thing keeping the copies apart was that each
 * closed over its own reader of the tree. There is one reader now, so there is
 * one rule. The RAW text is read, comments and all: the comment IS the
 * justification this looks for, and a stripped sample has blanked it.
 *
 * @param file - path relative to `src`
 */
export function uncommentedLeading(file: string): string[] {
  const lines = sourceOf(file).split('\n')
  const offenders: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (/^\s*(?:\/\/|\*|\/\*)/.test(line)) continue
    if (
      !/['"`][^'"`]*\bleading-(?:none|tight|snug|normal|relaxed|loose|\d|\[)/.test(
        line,
      )
    ) {
      continue
    }
    const window = [lines[index - 2] ?? '', lines[index - 1] ?? '', line].join(
      '\n',
    )
    if (/\/[/*][\s\S]*geometry/i.test(window)) continue
    offenders.push(`${file}:${index + 1}: ${line.trim()}`)
  }
  return offenders
}

let cachedNames: ReadonlyMap<string, readonly string[]> | null = null

/** Every named class-list constant the application declares. */
function namedClassLists(): ReadonlyMap<string, readonly string[]> {
  if (cachedNames) return cachedNames
  const names = new Map<string, readonly string[]>()
  for (const file of strippedSourcesOn()) {
    for (const [name, classes] of namedClassListsIn(file.code)) {
      names.set(name, classes)
    }
  }
  cachedNames = names
  return names
}

const UNHYPHENATED = new Set([
  'absolute',
  'block',
  'capitalize',
  'contents',
  'fixed',
  'flex',
  'grid',
  'grow',
  'hidden',
  'isolate',
  'italic',
  'lowercase',
  'overline',
  'relative',
  'shrink',
  'static',
  'sticky',
  'truncate',
  'underline',
  'uppercase',
])

/**
 * Is this token a utility, as opposed to a word that happens to be quoted?
 *
 * Hyphenated names (`text-xs`, `font-mono`) are the common case.
 * `uppercase` and `truncate` are utilities too, and a reader that demanded
 * a hyphen would drop the third register of monospace on the floor.
 */
function isUtility(token: string): boolean {
  if (UNHYPHENATED.has(token)) return true
  return /^[a-z@][a-z0-9:%./[\]_-]*-/i.test(token)
}

/** A string whose tokens look like a class list, not a sentence. */
function looksLikeClassList(classes: readonly string[]): boolean {
  return classes.some(isUtility)
}

/**
 * Named class-list constants declared in `source`.
 *
 * `const MONO_NUM_CLASS = 'font-mono tabular-nums'` stores under
 * `MONO_NUM_CLASS`. An object of class strings stores each property as
 * `Name.property`. The names are how a later `cn(MONO_NUM_CLASS, 'truncate')`
 * becomes one list instead of the extra class alone.
 */
function namedClassListsIn(source: string): Map<string, string[]> {
  const names = new Map<string, string[]>()
  const stringConst =
    /(?:export\s+)?(?:const|let)\s+([A-Za-z_][\w]*)\s*(?::[^=]+)?=\s*(['"`])([^'"`]*?)\2/g
  for (const match of source.matchAll(stringConst)) {
    const classes = classListOf(match[3])
    if (looksLikeClassList(classes)) names.set(match[1], classes)
  }
  const objectConst =
    /(?:export\s+)?(?:const|let)\s+([A-Za-z_][\w]*)\s*(?::[^=]+)?=\s*\{/g
  for (const match of source.matchAll(objectConst)) {
    const open = match.index + match[0].length - 1
    const close = matchingCloser(source, open, '{', '}')
    if (close < 0) continue
    const body = source.slice(open + 1, close)
    const objectName = match[1]
    const property = /([A-Za-z_][\w]*)\s*:\s*(['"`])([^'"`]*?)\2/g
    for (const entry of body.matchAll(property)) {
      const classes = classListOf(entry[3])
      if (!looksLikeClassList(classes)) continue
      names.set(`${objectName}.${entry[1]}`, classes)
    }
  }
  return names
}

/**
 * Call sites in `source`: `className` attributes and `cn()` calls.
 *
 * A `className={cn(…)}` is one site, owned by the `cn()` reader, so the
 * attribute reader steps over it rather than emitting the same list twice.
 */
function extractSites(
  source: string,
  file: string,
  names: ReadonlyMap<string, readonly string[]>,
): ClassListSite[] {
  const sites: ClassListSite[] = []
  const claimed = new Set<number>()
  const push = (index: number, classes: string[]) => {
    if (classes.length === 0 || claimed.has(index)) return
    claimed.add(index)
    sites.push({
      file,
      line: source.slice(0, index).split('\n').length,
      classes,
    })
  }

  const cnCall = /\bcn\s*\(/g
  for (const match of source.matchAll(cnCall)) {
    if (precededByFunction(source, match.index)) continue
    const open = match.index + match[0].length - 1
    const close = matchingCloser(source, open, '(', ')')
    if (close < 0) continue
    const body = source.slice(open + 1, close)
    push(match.index, classesInExpression(body, names))
  }

  const attr = /[A-Za-z]*[Cc]lassName\s*=\s*/g
  for (const match of source.matchAll(attr)) {
    const start = match.index + match[0].length
    const head = source[start]
    if (head === '"' || head === "'") {
      const end = source.indexOf(head, start + 1)
      if (end < 0) continue
      push(match.index, classListOf(source.slice(start + 1, end)))
      continue
    }
    if (head !== '{') continue
    const close = matchingCloser(source, start, '{', '}')
    if (close < 0) continue
    const body = source.slice(start + 1, close).trim()
    if (/^cn\s*\(/.test(body)) continue
    push(match.index, classesInExpression(body, names))
  }

  return sites.sort((a, b) => a.line - b.line || a.file.localeCompare(b.file))
}

/**
 * The utilities an expression writes: every string literal, plus every
 * named constant the table can resolve.
 *
 * Conditionals need no grammar of their own. `isOn && 'font-medium'` and
 * `active ? 'text-foreground' : 'text-muted-foreground'` both put their
 * classes in string literals, so collecting the literals *is* collecting
 * the conditional. Unknown identifiers (`className`, `isOn`) stay out.
 */
function classesInExpression(
  expression: string,
  names: ReadonlyMap<string, readonly string[]>,
): string[] {
  return classListOf([
    ...stringLiteralsIn(expression),
    ...namesInExpression(expression, names),
  ])
}

/** Quoted strings in `text`, skipping templates that interpolate. */
function stringLiteralsIn(text: string): string[] {
  const out: string[] = []
  let quote: string | null = null
  let start = -1
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quote) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) {
        const body = text.slice(start + 1, i)
        if (!(quote === '`' && body.includes('${'))) out.push(body)
        quote = null
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      start = i
    }
  }
  return out
}

/**
 * Resolvable names in `text`: `CANVAS_HEADER_TEXT`, `MONO_NUM_CLASS`.
 *
 * Camel-case identifiers are props and predicates (`className`, `isOn`) and
 * are not looked up. A name followed by `(` is a call, not a class list.
 */
function namesInExpression(
  text: string,
  names: ReadonlyMap<string, readonly string[]>,
): string[] {
  const out: string[] = []
  let quote: string | null = null
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quote) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (!/[A-Za-z_]/.test(char)) continue
    const held = text.slice(i).match(/^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*/)?.[0]
    if (!held) continue
    i += held.length - 1
    const after = text.slice(i + 1).match(/^\s*/)?.[0] ?? ''
    if (text[i + 1 + after.length] === '(') continue
    const classes = names.get(held)
    if (classes) out.push(...classes)
  }
  return out
}

/**
 * Index of the closer matching `source[openAt]`, quote-aware.
 *
 * JSX attribute lists and `cn()` argument lists both hold arbitrary
 * expressions: `onClick={() => set('mode', 'blank')}` carries a `>` and a
 * pair of quotes a regex would stop at. Depth plus quote state is the
 * same scan `buttonSizeContract` already uses on opening tags.
 */
function matchingCloser(
  source: string,
  openAt: number,
  open: string,
  close: string,
): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openAt; i < source.length; i += 1) {
    const char = source[i]
    if (quote) {
      if (char === '\\') {
        i += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** `function cn(` is a definition, not a call site. */
function precededByFunction(source: string, index: number): boolean {
  return /\bfunction\s+$/.test(source.slice(Math.max(0, index - 16), index))
}
