---
'uno-blueprint': patch
---

Small labels read in sentence case. Badges, tags, eyebrows, the canvas phase badge (`01 · Discover`), the divider captions (`Line of interaction`, `Line of visibility`, `Line of internal interaction`), the sidebar section and slice-group headings, and the Jump to… group headings are 12px sans at letter-spacing 0 in the case their strings are written in, rather than capitals with wide tracking. The phase badge drops mono for sans and keeps its overview-zoom counter-scale. A test now fails on `uppercase`, wide tracking, an inline `textTransform` or a positive `letterSpacing` in any authored component, dev page or stylesheet, and the composition guidelines state the rule. A deployment that renders its own labels through `Eyebrow` should pass them in sentence case: the component no longer capitalises.
