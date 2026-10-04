---
'uno-blueprint': minor
---

Shape, edge and elevation follow the site. The radius ladder now reads by job: `rounded-md` (controls) moves from 6px to 8px and `rounded-xl` (cards, panels, dialogs, sheets, cover figure frames) from 12px to 16px, while `rounded-sm` (4px) and `rounded-lg` (8px, cells) are unchanged, so the canvas keeps its shape. Neutral edges come in three translucent-ink steps set by new per-theme dials, `--border-alpha-resting`, `--border-alpha-hover` and `--border-alpha-hot` (light 9% / 17% / 42%, dark 8% / 15% / 45%): `--border` is the resting step, and the new `--border-strong` and `--border-stronger` tokens (utilities `border-strong`, `border-stronger`) are the hover and hot steps. `--border-strong` is also the step for anything drawn on the canvas ground. The floating cell panel and the floating agent dock move onto the surface rung. Resting cards, panels, the sticky slide header and plain buttons drop their decorative shadows, and only what floats keeps one. The filter toolbar button marks its checked state with the hot edge instead of a shadow and a black hairline. The composition overview now states the radius ladder, the border steps, the elevation rule and the dashed-versus-solid rule.

Upgrading a deployment:

- Custom CSS that sets `--radius` still scales every rung, but the proportions have changed: md is now ×1 (was ×0.75) and xl ×2 (was ×1.5). A deployment that chose a base for a 12px dialog corner should check its dialogs and sheets.
- `--border` no longer reads `--contrast`. It reads `--border-alpha-resting`. A deployment that turned `--contrast` to strengthen its dividers should set the three `--border-alpha-*` dials in both theme files instead. The print stylesheet restates light's values.
- A deployment stylesheet that overrode `--border` directly keeps working, but `--border-strong` and `--border-stronger` will not follow that override. Set the dials instead so all three steps move together.
