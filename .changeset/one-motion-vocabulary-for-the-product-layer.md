---
'uno-blueprint': minor
---

One motion vocabulary for the product layer. Four curves named by role — `--ease-arrive` (something enters or answers a hover), `--ease-leave` (something exits), `--ease-move` (something on screen goes from A to B) and `--ease-spring` (a small thing pops, as a `linear()` spring where the browser has it) — join the existing duration ladder in `styles/animations.css`, with `ease-arrive|leave|move|spring` utilities and a TypeScript mirror in `lib/motion.ts` (`EASE_POINTS`, `MOTION_EASE`, `MOTION_SPRING_LINEAR`, `cubicBezierEase`, `easeMove`). Every product-layer transition now names a `--motion-*` duration, a role curve and a reduced-motion path, and a guard fails on stock `duration-*`, `delay-*` or `ease-*` classes, raw times or keyword curves in inline styles, framer-motion options and product stylesheets, outside the vendored `ui/` layer and the canvas reveal chain.

What a reader will notice:

- Hover colour and opacity changes that used Tailwind's default curve (`transition-colors` and friends) now ease on arrive, at the same 150 ms.
- The editor surface fade, the presentation entry and the shell's entrance ladder move from `ease-out` to arrive; the presentation exit, the cell panel's close and the image zoom's close run on leave.
- Annotation swatches and the mobile agent button now overshoot a little on hover and press (spring).
- Chevrons, the cover tab indicator, the canvas load bar and image zoom ease on move.
- Prose links ease only their colour, at 150 ms rather than 180 ms, and not at all under reduced motion; cell hover and the slice badges gain a reduced-motion path. The delayed spinner holds 320 ms instead of 300 ms.

`--ease-structural` stays as an alias of arrive and `--ease-camera` keeps its current curve, so a deployment that reads either needs no change.
