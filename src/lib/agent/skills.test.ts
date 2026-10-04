import { describe, expect, it } from 'vitest'
import {
  AGENT_SKILL_COMMANDS,
  completeSkillToken,
  draftWithoutSkillTokens,
  findSkillLookup,
  findSkillTokens,
  findSkillNearMisses,
  skillMatchesQuery,
  skillsInDraft,
} from '@/lib/agent/skills'
import { TOOL_DEFINITIONS } from '@/lib/agent/tools/definitions'
import { readReference, referenceNames } from '@/lib/agent/tools/references'

describe('agent skills (vendored SKILL.md)', () => {
  it('ships all four skills with content', () => {
    expect(AGENT_SKILL_COMMANDS.map((command) => command.id)).toEqual([
      'ub:map',
      'ub:slice',
      'ub:audit',
      'ub:whatif',
    ])
    for (const command of AGENT_SKILL_COMMANDS) {
      expect(command.content, command.id).toBeTruthy()
    }
  })

  it('reads the skill out of a typed-through draft, and only a namespaced one', () => {
    expect(findSkillTokens('/ub:audit the sample scenario')).toEqual([
      {
        command: AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit'),
        start: 0,
        end: 9,
      },
    ])
    // The official name invokes; the bare alias only finds.
    expect(findSkillTokens('/audit')).toEqual([])
    expect(findSkillTokens('/frobnicate now')).toEqual([])
  })

  it('prefix-matches queries against ids and aliases', () => {
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    expect(skillMatchesQuery(audit, 'au')).toBe(true)
    expect(skillMatchesQuery(audit, 'ub:au')).toBe(true)
    expect(skillMatchesQuery(audit, 'zz')).toBe(false)
  })
})

describe('the skill lookup a draft carries', () => {
  // The table the trigger exists for: a slash opens a lookup when it opens a
  // word, and the four strings below are the ones that used to be mistaken
  // for one the moment the trigger stopped being anchored to index 0.
  const cases: [string, string | null][] = [
    ['/', ''],
    ['/ub:aud', 'ub:aud'],
    ['Hey can u /ub:aud', 'ub:aud'],
    ['Hey can u /', ''],
    ['check this、/aud', 'aud'],
    ['/ub:audit this', null],
    ['check /ub:audit/notes.md', null],
    ['look at src/lib', null],
    ['see http://example.test', null],
    ['do this and/or that', null],
    ['on 2026/09/17', null],
  ]
  for (const [draft, query] of cases) {
    it(`${query === null ? 'ignores' : `reads "${query}" from`} ${JSON.stringify(draft)}`, () => {
      expect(findSkillLookup(draft)?.query ?? null).toBe(query)
    })
  }

  it('reads the token to the end of the draft, and stops at a space', () => {
    const lookup = findSkillLookup('Hey can u /ub:aud')
    expect(lookup).toEqual({ query: 'ub:aud', start: 10, end: 17 })
    expect(findSkillLookup('Hey can u /ub:aud ')).toBeNull()
  })

  it('still opens on a second token after a resolved head skill', () => {
    // The reversal. A guard used to refuse a lookup once the draft opened
    // with a resolved skill — that skill owning its arguments, as a head
    // command does in the tool this composer mirrors — and it contradicted
    // the feature it shipped beside: a message carries as many skills as its
    // text names, so the second one has to be findable.
    expect(findSkillLookup('/ub:map notes then /ub:au')?.query).toBe('ub:au')
    // A path typed for the head skill to read opens a lookup that matches no
    // skill, and a lookup with no matches opens no menu — which is the whole
    // of what the guard was buying.
    expect(findSkillLookup('/ub:map from /notes')?.query).toBe('notes')
    expect(
      AGENT_SKILL_COMMANDS.filter((entry) => skillMatchesQuery(entry, 'notes')),
    ).toEqual([])
    // An unresolved head token never owned anything either way.
    expect(findSkillLookup('/audit the intake and /ub:m')?.query).toBe('ub:m')
  })

  it('completes the token in place, leaving the prose before it untouched', () => {
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    const draft = 'Hey can u /ub:aud'
    // The token gains its ending and a space, and does not move: the badge
    // this replaced took it out of the sentence and stood it at the front.
    expect(completeSkillToken(draft, findSkillLookup(draft)!, audit)).toEqual({
      text: 'Hey can u /ub:audit ',
      caret: 'Hey can u /ub:audit '.length,
    })
    expect(completeSkillToken('/aud', findSkillLookup('/aud')!, audit)).toEqual({
      text: '/ub:audit ',
      caret: '/ub:audit '.length,
    })
  })

  it('keeps a mid-sentence space rather than doubling it', () => {
    // A span with prose behind it — the near-miss offer's, or a pick made
    // mid-sentence: a second space here is a hole in the sentence.
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    const draft = 'then /audit the intake'
    expect(completeSkillToken(draft, { start: 5, end: 11 }, audit)).toEqual({
      text: 'then /ub:audit the intake',
      // And the caret comes back past the name that was written and the
      // space the prose already had, not at the end of the sentence it sits
      // in — 15 against 25. Past the space, because a caret left at the end
      // of the name is a caret at the end of a token, and the lookup would
      // reopen on it.
      caret: 'then /ub:audit '.length,
    })
  })

  it('closes its own lookup, so the menu does not reopen on the completion', () => {
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    const draft = 'Hey can u /ub:aud'
    const completed = completeSkillToken(draft, findSkillLookup(draft)!, audit)
    expect(findSkillLookup(completed.text)).toBeNull()
  })
})

describe('the skill lookup under the caret', () => {
  // The lookup reads the token the caret sits at the END of, wherever in the
  // draft that is. `at` marks the caret in each case; the draft is the string
  // with the mark taken out.
  const at = (marked: string) => {
    const caret = marked.indexOf('|')
    return { draft: marked.slice(0, caret) + marked.slice(caret + 1), caret }
  }
  const lookupAt = (marked: string) => {
    const { draft, caret } = at(marked)
    return findSkillLookup(draft, caret)
  }
  const cases: [string, string | null][] = [
    ['Can you /| this part', ''],
    ['Can you /au| this part', 'au'],
    ['/au| this part', 'au'],
    ['Can you /ub:aud|, please', 'ub:aud'],
    ['check this、/aud| now', 'aud'],
    // The caret inside a token, not at its end: the reader is editing a word,
    // and the menu would complete half of it.
    ['Can you /a|u this part', null],
    ['Can you /|au this part', null],
    // The caret away from any slash at all.
    ['Can you /au this| part', null],
    ['Can you| /au this part', null],
    // What the tail rule refused, it still refuses with the caret beside it.
    ['look at src/lib| today', null],
    ['look at src/| today', null],
    ['see http://example.test| now', null],
    ['do this and/or| that', null],
    ['do this and/| that', null],
    ['on 2026/09/17| at noon', null],
    ['check /ub:audit|/notes.md', null],
    ['check /ub:audit/notes.md| now', null],
  ]
  for (const [marked, query] of cases) {
    it(`${query === null ? 'ignores' : `reads "${query}" from`} ${JSON.stringify(marked)}`, () => {
      const { draft, caret } = at(marked)
      expect(findSkillLookup(draft, caret)?.query ?? null).toBe(query)
    })
  }

  it('opens nothing on a name that already resolves, with prose after the caret', () => {
    // Clicking or arrowing past a finished name is moving through a sentence;
    // a menu there would take the next Enter as a pick instead of a send.
    expect(lookupAt('/ub:map| notes')).toBeNull()
    expect(lookupAt('then /ub:audit| it')).toBeNull()
    // A name that does not resolve yet still opens, mid-sentence or not.
    expect(lookupAt('/ub:ma| notes')?.query).toBe('ub:ma')
    // At the tail the full name still opens, as it always has.
    expect(findSkillLookup('/ub:map')?.query).toBe('ub:map')
    expect(findSkillLookup('then /ub:audit')?.query).toBe('ub:audit')
  })

  it('treats a newline after the token as its gap, and lands the caret past it', () => {
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    const { draft, caret } = at('/au|\nnext')
    const completed = completeSkillToken(draft, findSkillLookup(draft, caret)!, audit)
    // No space added — the newline already closes the token — and the caret
    // goes over it, to the head of the next line.
    expect(completed).toEqual({ text: '/ub:audit\nnext', caret: '/ub:audit\n'.length })
    expect(findSkillLookup(completed.text, completed.caret)).toBeNull()
  })

  it('spans the token before the caret and nothing after it', () => {
    const { draft, caret } = at('Can you /au| this part')
    expect(findSkillLookup(draft, caret)).toEqual({
      query: 'au',
      start: 'Can you '.length,
      end: 'Can you /au'.length,
    })
  })

  it('reads the tail exactly as before when the caret is at the end', () => {
    for (const draft of ['Hey can u /ub:aud', '/', 'check /ub:audit/notes.md', 'x /a ']) {
      expect(findSkillLookup(draft, draft.length)).toEqual(findSkillLookup(draft))
    }
  })

  it('completes a mid-sentence token in place and puts the caret past its gap', () => {
    const audit = AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit')!
    const { draft, caret } = at('Can you /au| this part')
    const completed = completeSkillToken(draft, findSkillLookup(draft, caret)!, audit)
    expect(completed).toEqual({
      text: 'Can you /ub:audit this part',
      caret: 'Can you /ub:audit '.length,
    })
    // And the menu does not reopen on the name it just wrote.
    expect(findSkillLookup(completed.text, completed.caret)).toBeNull()
  })
})

describe('the skills a draft names', () => {
  const idsIn = (draft: string) =>
    findSkillTokens(draft).map((span) => span.command.id)

  it('reads a token wherever it opens a word, in the order it appears', () => {
    expect(idsIn('build this from my notes /ub:map then /ub:audit it')).toEqual([
      'ub:map',
      'ub:audit',
    ])
    expect(idsIn('check this、/ub:whatif')).toEqual(['ub:whatif'])
  })

  it('reports the span the composer colours', () => {
    const spans = findSkillTokens('Hey can u /ub:audit the intake')
    expect(spans).toHaveLength(1)
    expect('Hey can u /ub:audit the intake'.slice(spans[0]!.start, spans[0]!.end))
      .toBe('/ub:audit')
  })

  it('reads nothing out of the strings a slash is text in', () => {
    // The same table the lookup refuses. This walk is NOT tail-anchored, so
    // the path cases are its own to refuse: a token with a path behind it,
    // and a URL.
    expect(idsIn('check /ub:audit/notes.md')).toEqual([])
    expect(idsIn('see http://example.test')).toEqual([])
    expect(idsIn('look at src/lib')).toEqual([])
    expect(idsIn('do this and/or that')).toEqual([])
    expect(idsIn('on 2026/09/17')).toEqual([])
    // A bare alias resolves nothing, so it colours nothing and runs nothing.
    expect(idsIn('then /audit the intake')).toEqual([])
  })

  it('runs one skill per resolved token, in order, deduped and uncapped', () => {
    // `skillsInDraft` is what the send reads and the only record of what a
    // message runs, and it was pinned only through the composer and the loop.
    // Order, because the order is the instruction.
    expect(skillsInDraft('build this from my notes /ub:map then /ub:audit it')
      .map((skill) => skill.id)).toEqual(['ub:map', 'ub:audit'])
    // Once each, however many times it is named: a second copy of a
    // multi-kilobyte SKILL.md buys nothing but prompt.
    expect(skillsInDraft('/ub:map from my notes, then /ub:map the rest')
      .map((skill) => skill.id)).toEqual(['ub:map'])
    // UNCAPPED — all four in one message, and no ceiling to trip over. A
    // limit here would be a rule with no failure behind it.
    expect(skillsInDraft('/ub:map then /ub:slice then /ub:audit then /ub:whatif')
      .map((skill) => skill.id)).toEqual(['ub:map', 'ub:slice', 'ub:audit', 'ub:whatif'])
    // A bare alias resolves nothing, so it runs nothing.
    expect(skillsInDraft('then /audit the intake')).toEqual([])
  })

  it('says what the message holds besides the skills it names', () => {
    expect(draftWithoutSkillTokens('/ub:audit')).toBe('')
    expect(draftWithoutSkillTokens('  /ub:map /ub:audit ')).toBe('')
    expect(draftWithoutSkillTokens('Hey can u /ub:audit the intake')).toBe(
      'Hey can u  the intake',
    )
  })
})

describe('a near-miss token that would send as prose', () => {
  it('names the closest skill for a bare alias rather than resolving it', () => {
    expect(findSkillNearMisses('then /audit the intake')).toEqual([
      {
        token: 'audit',
        command: AGENT_SKILL_COMMANDS.find((entry) => entry.id === 'ub:audit'),
        start: 5,
        end: 11,
      },
    ])
  })

  it('reports EVERY miss in the draft, in the order they appear', () => {
    // Several skills per message is normal, so several near misses are too.
    // A walk that stopped at the first left the second silent — asked about
    // `/audit`, completed it, and sent with `/map` still naming nothing.
    const draft = 'check /audit then /map this'
    expect(findSkillNearMisses(draft).map((miss) => miss.token)).toEqual([
      'audit',
      'map',
    ])
    // And a resolved token mixed in among them is not a miss.
    expect(
      findSkillNearMisses('/ub:map the notes then /audit it').map(
        (miss) => miss.token,
      ),
    ).toEqual(['audit'])
  })

  it('reports the span, so accepting rewrites the token where it sits', () => {
    const draft = 'Hey can u /audit the goal setting'
    const [unrun] = findSkillNearMisses(draft)
    expect(draft.slice(unrun!.start, unrun!.end)).toBe('/audit')
  })

  it('stays quiet where there is nothing to say', () => {
    // A token that RESOLVES is not a near miss. It is coloured in the field
    // and it runs, so there is no silence to break and no question to ask —
    // this is the confirm-once prompt's deletion, pinned.
    expect(findSkillNearMisses('/ub:audit the intake')).toEqual([])
    expect(findSkillNearMisses('Hey can u /ub:audit the goal setting')).toEqual([])
    // A token naming nothing is a word with a slash on it.
    expect(findSkillNearMisses('Hey can u /frobnicate this')).toEqual([])
    // The same strings the lookup refuses to fire on.
    expect(findSkillNearMisses('look at src/lib')).toEqual([])
    expect(findSkillNearMisses('do this and/or that')).toEqual([])
    expect(findSkillNearMisses('on 2026/09/17')).toEqual([])
    // This walk is NOT tail-anchored, so the path cases it has to refuse are
    // its own to refuse: a token with a path behind it, and a URL.
    expect(findSkillNearMisses('check /audit/notes.md')).toEqual([])
    expect(findSkillNearMisses('see http://example.test')).toEqual([])
  })
})

describe('vendored references', () => {
  // Importing references.ts also fires its init assertion that the record
  // and REFERENCE_NAMES agree — this test existing is what runs it.
  it('serves every published name with real content', () => {
    for (const name of referenceNames()) {
      expect(readReference(name, TOOL_DEFINITIONS).length, name).toBeGreaterThan(100)
    }
  })

  it('answers an unknown name with the available list, not a throw', () => {
    expect(readReference('nope', TOOL_DEFINITIONS)).toContain('Unknown reference')
  })
})
