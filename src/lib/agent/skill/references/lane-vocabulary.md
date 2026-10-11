# Lane Vocabulary — cross-phase drafting convergence

`references/lane-roles.md` says how a role renders. This says how independent
drafters **converge** on the same roles and labels across many phases — so a
10-phase service drafted by parallel agents reads as one blueprint, not ten.

Read this before drafting when a service has more than one phase/scenario,
especially when phases are drafted in parallel. Feed it into every drafter.

## Why this exists

Parallel per-phase drafting reliably diverges three ways:

1. **No customer spine.** Sales/procurement/renewal phases get drafted with the
   buyer cast as `backstage_actions` and no `customer_actions` lane — so half
   the service has an interaction line and half doesn't.
2. **The same actor, named four ways.** One team appears as `前台·BD` in phase ①,
   `前台·售前对接` in ②, `我方人工` in ⑤, `前台·现场` in ⑥ — the reader can't tell
   it's one group.
3. **Human work cast as a touchpoint.** Back-office staff actions get modeled
   as `backstage_touchpoints` touchpoints instead of `backstage_actions` prose.

The fixes below are conventions, not schema rules. The validator won't enforce
them; the `blueprint-reviewer` agent flags deviations.

## 1. Who is the customer of THIS phase?

Every phase has a spine — the actor whose journey the phase follows. Put that
actor on `customer_actions` (one per path; it draws the interaction line). The
spine can **change across phases** of one service, and that is correct: a B2B
service sells to a buyer, then serves end users. Pick per phase-type:

| Phase type | Spine actor (→ `customer_actions`) |
| --- | --- |
| Sales / bid / win | The **buyer** you're selling to (procurement lead, sponsor) |
| Procurement / contracting | The **buyer**'s purchasing/contracting role |
| Setup / onboarding / migration | The **admin** being provisioned (their first-run journey) |
| Training / account handout | The **end user** or admin being trained |
| Daily operations / inspection | The **operator** running the service day-to-day |
| Incident / fault / complaint | The **person who reports it** (citizen, end user, operator) |
| Assessment / reporting | The **party being reported to** (regulator, client sponsor) |
| Renewal / retrofit / exit | The **buyer** again (the renewal decision-maker) |

If a phase genuinely has no external spine (pure internal ops), it's valid to
have **no** `customer_actions` lane — but say so deliberately, don't just drop
it. "Whose journey is the spine?" is the elicitation question
(`references/lane-roles.md` §Line-anchoring).

## 2. One label per actor group, service-wide

Before drafting phase 2+, list the actor groups already named in earlier phases
and **reuse the exact label**. Maintain a small actor glossary for the
service (in the workspace notes or the IR provenance) so drafters converge:

| Actor group | One canonical `display_name` | Typical role |
| --- | --- | --- |
| The provider's customer-facing team | e.g. `前台·<provider>` (pick once) | `frontstage_actions` |
| The provider's back-office | e.g. `后台·<provider>` | `backstage_actions` |
| External partner/vendor | e.g. `支撑·<partner>` | `support_actions` |
| The buyer/customer spine | e.g. `<buyer org>` | `customer_actions` |

Rules:

- Same group → **byte-identical** label in every phase. Not "our staff" here and
  "provider team" there.
- **The label survives role changes.** An actor group's ROLE legitimately varies
  by phase (the field crew is the `customer_actions` spine in an operations
  phase but `frontstage_actions` in an incident phase) — its LABEL must not.
  Therefore never bake a role word into a role-varying group's label: `青翼·班组`
  in every phase, not `青翼·班组` in one and `前台·青翼` in another.
- **Same rule for shared systems.** A platform lane (e.g. `平台·<provider>`) may
  be `frontstage_touchpoints` in a phase where the spine actor touches it directly and
  `backstage_touchpoints` where it works behind the spine — that flip is correct, but
  decide it from "does THIS phase's spine actor interact with it?", label it
  identically everywhere, and if one phase has BOTH a spine-facing surface and
  an internal one (citizen miniapp + admin console), split into two lanes
  rather than casting the customer's touchpoint backstage.
- Distinguish **actor** (a who → actions role) from **touchpoint** (a what →
  `*_touchpoints` role). A person doing work is `*_actions`, not a
  `*_touchpoints` touchpoint.
- Prefix conventions (`前台·` / `后台· ` / `支撑·`) are optional but, once chosen,
  applied everywhere — and only on groups whose role never varies (see above).
- Non-spine client orgs (e.g. a supervising bureau): `null`
  (`references/lane-roles.md` § No custom roles), with the SAME
  `display_name` in every phase to keep them one group.

## 3. Source-layout crosswalk

Foreign diagrams rarely use Shostack roles. Map their lanes to roles once, then
apply the mapping to every phase (see also `skills/map/references/crosswalk-schema.json`):

| Source layout | Map to role |
| --- | --- |
| FigJam **actor lanes** (one lane per team) | The spine actor → `customer_actions`; other people-lanes → `frontstage_actions` / `backstage_actions` by visibility; system lanes → `*_touchpoints`; vendors → `support_actions` |
| Notion / Shostack **5-lane** (物理证据 / 服务对象 / 前台 / 后台 / 支撑) | 物理证据 → `storyboard` (or `null` when it carries no imagery); 服务对象 → `customer_actions`; 前台 → `frontstage_actions` (+ `frontstage_touchpoints` for its touchpoints); 后台 → `backstage_actions` (+ `backstage_touchpoints`); 支撑 → `support_actions` |
| Spreadsheet with a "system/tool" column | Tool column → the matching `*_touchpoints` lane; owner column → the `*_actions` lane |

Don't transcribe a foreign layout verbatim — interpret it to the canonical
roles so all phases share one structure.
