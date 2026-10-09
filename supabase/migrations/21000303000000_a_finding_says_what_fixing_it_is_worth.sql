-- A finding says what fixing it is worth, and what fixing it costs.
--
-- Authored 2026-10-09.
--
-- A finding carried one rating, `severity`, and severity answers one
-- question: how wrong is this? It does not answer the question a team asks
-- when it sits down with an audit, which is what to fix first. A critical
-- finding that takes a quarter of rework and a warning that takes one
-- sentence are not ordered by how wrong each is.
--
-- So a finding gains two more ratings, each `low | medium | high`:
--
--   impact   how much fixing it matters to the service
--   effort   how much work the fix takes
--
-- The auditor assigns both beside severity, from the rubric in each check
-- doc, and the audit report groups its findings by the pair: high impact for
-- low effort first, then the high-impact work worth planning, then the
-- cheap wins, then everything else.
--
-- ── Why nullable ──────────────────────────────────────────────────────────
--
-- Every finding recorded before this migration has neither rating, and
-- inventing one for it would put a judgement in the ledger that no auditor
-- made. So both columns are nullable, an existing row stays exactly as it
-- is, and a reader shows a null as unrated and sorts it last. A finding
-- recorded from here on carries both: the auditor's output and the agent's
-- `create_finding` refuse one without them, which is where the rule belongs —
-- a NOT NULL here would refuse every historical row along with it.
--
-- ── Why update is granted ────────────────────────────────────────────────
--
-- An audit that re-detects an open finding updates it in place, and a
-- re-run whose only change is a rating must move that rating rather than
-- raise a twin. The update grant is column-narrowed to what that rewrite
-- touches, so the two new columns join it.

alter table public.audit_findings
  add column impact text
    constraint audit_findings_impact_check check (impact in ('low', 'medium', 'high')),
  add column effort text
    constraint audit_findings_effort_check check (effort in ('low', 'medium', 'high'));

comment on column public.audit_findings.impact is
  'How much fixing this finding matters to the service: low, medium or high. '
  'Null on a finding recorded before the rating existed, which reads as unrated.';

comment on column public.audit_findings.effort is
  'How much work the fix takes: low, medium or high. Null on a finding '
  'recorded before the rating existed, which reads as unrated.';

-- @recipe — an audit re-run rewrites an open finding's ratings in place, so
-- the role that records findings may update the two new columns, and only
-- those beside the ones it already could.

grant update (impact, effort) on public.audit_findings to authenticated;

