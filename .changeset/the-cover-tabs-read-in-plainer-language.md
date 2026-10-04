---
'uno-blueprint': patch
---

The cover's Overview, Blueprints, Slices and Skills tabs read in plainer language. `src/content/coverContent.ts` keeps the same sections, figures, terms and links; only the wording changes. Em-dash asides become full sentences, the four skill summaries say what each skill does before what it produces, and the slice-type table reads off the slicing figure: a journey is one actor and the cells theirs connect to, a step is one moment across every lane, a lane is one row across every step.

Upgrading a deployment:

- A deployment that copies these four tabs verbatim into its own cover content should take the new text from `src/content/coverContent.ts`, keeping its own names where it already differs (for example a fourth surface it actually runs). A deployment that wrote its own tabs needs no change.
