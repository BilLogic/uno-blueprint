---
'uno-blueprint': patch
---

A slash typed mid-sentence opens the skill menu. The lookup in the agent composer follows the caret instead of reading only the tail of the draft: `findSkillLookup(draft, caret)` returns the token the caret sits at the end of, so moving back into a sentence and typing `/au` between two words offers `/ub:audit` there, and accepting completes the token in place with the caret past the name and its space. The caret defaults to the end of the draft, where the lookup reads exactly as before; paths, URLs, `and/or` and dates still never open it, a caret inside a token, a caret moved past a name that already resolves with prose after it, or a selected range opens nothing, and moving the caret with the arrow keys or a click re-reads the lookup. Accepting a near-miss offer now leaves the caret past the space after the completed name as well, so the menu does not reopen on the name just written. While an IME composes, Enter and the arrow keys in the composer belong to the IME: they neither pick from the menu nor send. `ComposerInkedField` takes a new required `onSelectionChange` prop that reports the field's selection with the text it was read from.

Upgrading a deployment: no action; it comes with the pin.
