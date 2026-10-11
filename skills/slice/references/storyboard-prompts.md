# Storyboard Prompts

Illustrations for a journey slice's slides. **Optional and last**: slides are
complete without images, and a slice ships text-first. Read this before
generating anything.

## Order of operations

1. Text path complete — slice validated, reviewed, imported.
2. Character reference, once per slice.
3. Per-frame scenes, each feeding the reference.
4. **Human review gate** before the first upload for that slice.
5. Upload, stamp `illustration.updated_at`, re-import.

## ⚠ REQUIRED — redaction before any prompt leaves the machine

Prompts go to a third-party image model. Strip, every time:

- Person names, employers, schools, job titles tied to an individual
- Emails, phone numbers, URLs, ticket ids, account numbers
- Anything lifted verbatim from evidence or interview notes

Describe a **persona archetype** ("a first-week field technician in their
twenties, working out of a service van"), per the persona rule in
`skills/slice/SKILL.md` § Hard rules.

Image-model keys follow `references/adapter-contract.md` §7.

## Character reference

One image per slice, generated first, saved to
`slices/<slice-key>/character-ref.png`. Every frame prompt then references it
so the actor stays the same person across the storyboard — inconsistent
characters are what make generated storyboards read as slop.

```
A single character reference sheet: <persona archetype, 1 sentence>.
Neutral background. Front view and three-quarter view.
<style block>
```

## Style block (append to every prompt, unchanged)

```
Flat vector illustration, clean line work, limited palette, soft shadows.
Consistent character design matching the reference. 16:9 composition.
No text, no labels, no logos, no UI chrome in the image.
```

Text in generated images is unreliable and unlocalizable — the title is
already rendered by the app, in the right language. Keep it out of the
picture.

## Per-frame prompt

```
<Character reference: slices/<key>/character-ref.png>
Scene: <what the actor is doing in this frame, from the narrative, redacted>.
Setting: <where, one clause>. Mood: <one word — the frame's feeling>.
<style block>
```

Derive the scene from the frame's *narrative*, not from cell content
verbatim. One frame, one moment, one action — a prompt covering two moments
produces a muddled image.

## Files and resume

- Deterministic paths: `slices/<slice-key>/frame-<position>.png`. Same frame
  regenerated overwrites in place, so a re-run produces no churn.
- Rate limits: resume per frame. Frames already on disk are skipped unless
  explicitly regenerated — never restart the whole slice because frame 7
  failed.
- After upload, stamp `illustration.updated_at` on the frame. The app
  cache-busts on it; without the stamp, viewers keep seeing the old image.

## Human review gate

Before the **first** upload for a slice, show the user the character
reference and at least one frame. Generated people carry the model's biases —
who it draws as a technician, a customer, a nurse. That judgment is the user's to
make, once per slice, before the images become the artifact everyone sees.

Re-generations of an already-approved slice do not re-trigger the gate unless
the persona description changed.
