-- Authored 2026-11-01.
-- Approved: one plain word for what a person may change.
--
-- The right a profile holds was "may confirm", and a cell it stood behind was
-- "owner-confirmed". Uno keeps the blueprint of any business, and the person
-- who holds that right is often not its owner, so the words become the ones
-- the tools already used for the act: someone who **may approve** makes a
-- cell **approved**. The idea is unchanged; only its names move.
--
--   profiles.may_confirm       → profiles.may_approve
--   cells.confirmed_by / _at   → cells.approved_by / approved_at
--   confirming_profile_id()    → approving_profile_id()
--   confirm_cell(uuid)         → approve_cell(uuid)
--
-- A rename moves the column, the function and their grants, and nothing that
-- names them inside a function body. So every core function whose body names
-- an old name is rewritten from its live definition, one exact replacement at
-- a time, and a replacement that matches nothing stops the migration. A
-- caller's yes on a tool call (`p_confirmed`, `confirmed: true`) is a separate
-- idea — the person said yes to this write — and keeps its name.
--
-- No compatibility names: the branch that introduced them is unreleased. A
-- deployment that installed `scripts/recipes/cell-search.sql` re-applies it
-- after this migration; the recipe's embedding write calls the renamed guard.

alter table public.profiles rename column may_confirm to may_approve;
alter table public.cells rename column confirmed_by to approved_by;
alter table public.cells rename column confirmed_at to approved_at;
alter table public.cells rename constraint cells_confirmed_paired to cells_approved_paired;
alter table public.cells rename constraint cells_confirmed_by_fkey to cells_approved_by_fkey;
alter function public.confirming_profile_id() rename to approving_profile_id;
alter function public.confirm_cell(uuid) rename to approve_cell;

do $rewrite$
declare
  edit record;
  body text;
  previous text;
  current_signature text;
begin
  for edit in
    select * from (values
      (1, 'public.approving_profile_id()', 'not v_profile.may_confirm', 'not v_profile.may_approve'),
      (2, 'public.approving_profile_id()', 'only someone who may confirm can approve a change or confirm a cell',
          'only someone who may approve can approve a change or a cell'),
      (3, 'public.approve_cell(uuid)', 'public.confirming_profile_id()', 'public.approving_profile_id()'),
      (4, 'public.approve_cell(uuid)', 'set confirmed_by = v_profile, confirmed_at = now()',
          'set approved_by = v_profile, approved_at = now()'),
      (5, 'public.approve_cell(uuid)', $s$'confirmed_by', v_profile$s$, $s$'approved_by', v_profile$s$),
      (6, 'public.decline_suggested_change(uuid)', 'public.confirming_profile_id()', 'public.approving_profile_id()'),
      (7, 'public.approve_cell_content_in_session(uuid,uuid)', 'public.confirming_profile_id()', 'public.approving_profile_id()'),
      (8, 'public.approve_cell_content_in_session(uuid,uuid)', 'confirmed_by = v_profile', 'approved_by = v_profile'),
      (9, 'public.approve_cell_content_in_session(uuid,uuid)', 'confirmed_at = now()', 'approved_at = now()'),
      (10, 'public.approve_cell_content_in_session(uuid,uuid)', $s$'confirmed_by'$s$, $s$'approved_by'$s$),
      (11, 'public.approve_cell_content_in_session(uuid,uuid)', $s$'confirmed_at'$s$, $s$'approved_at'$s$),
      (12, 'public.approve_cell_content_in_session(uuid,uuid)', 'v_previous.confirmed_by', 'v_previous.approved_by'),
      (13, 'public.approve_cell_content_in_session(uuid,uuid)', 'v_previous.confirmed_at', 'v_previous.approved_at'),
      (14, 'public.approve_proposal_in_session(uuid,uuid)', 'public.confirming_profile_id()', 'public.approving_profile_id()'),
      (15, 'public.run_agent_tool(text,jsonb,uuid,uuid,boolean)', 'profile.may_confirm', 'profile.may_approve'),
      (16, 'public.run_agent_tool(text,jsonb,uuid,uuid,boolean)', 'A person who may confirm must review and approve it.',
          'A person who may approve must review and approve it.'),
      (18, 'public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)', 'public.confirming_profile_id()', 'public.approving_profile_id()'),
      (19, 'public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)', 'confirmed_by=profile,confirmed_at=now()',
          'approved_by=profile,approved_at=now()'),
      (20, 'public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)', 'p.may_confirm', 'p.may_approve'),
      (21, 'public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)', 'someone who may confirm can revise it',
          'someone who may approve can revise it'),
      (22, null, null, null)
    ) as edits(n, signature, old, new)
    order by n
  loop
    -- A new signature, or the end: the finished body of the last one runs.
    if current_signature is not null and edit.signature is distinct from current_signature then
      execute body;
    end if;
    exit when edit.signature is null;
    if edit.signature is distinct from current_signature then
      current_signature := edit.signature;
      body := pg_get_functiondef(edit.signature::regprocedure);
    end if;
    previous := body;
    body := replace(body, edit.old, edit.new);
    if body = previous then
      raise exception 'The approval rename found no "%" in %', edit.old, edit.signature;
    end if;
  end loop;
end
$rewrite$;

-- The refusal a write gets without a service names the new word; the
-- contracts are restated beside it, as every gateway migration does.
-- BEGIN DERIVED WRITE CONTRACTS
create or replace function public.agent_write_contracts() returns jsonb
language sql immutable set search_path = pg_catalog, pg_temp
as $contracts$ select '{"create_service":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Service name"},"summary":{"type":"string","description":"What this service offers; omit for none"}},"required":["name"],"additionalProperties":false},"create_stakeholder":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"How this actor is written on the canvas, e.g. \"Blueprint owner\""},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider"},"summary":{"type":"string","description":"Who they are, in one line; omit for none"},"aliases":{"type":"array","items":{"type":"string"},"description":"Other spellings already present in this blueprint"}},"required":["name","kind"],"additionalProperties":false},"update_stakeholder":{"type":"object","properties":{"stakeholder_id":{"type":"string","minLength":1,"description":"Stakeholder id"},"name":{"type":"string","description":"New name; omit to keep"},"kind":{"type":"string","enum":["recipient","staff","partner","provider"],"description":"recipient | staff | partner | provider; omit to keep"},"summary":{"type":"string","description":"One line; omit to keep"},"aliases":{"type":"array","items":{"type":"string"},"description":"Replaces the alias list; omit to keep"}},"required":["stakeholder_id"],"additionalProperties":false},"create_phase":{"type":"object","properties":{"name":{"type":"string","minLength":1,"description":"Phase name"},"summary":{"type":"string","description":"One-line summary; omit for none"}},"required":["name"],"additionalProperties":false},"create_scenario":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Short stage label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this scenario; an empty string leaves it blank; omit for none"},"path_name":{"type":"string","description":"First path name; defaults to \"Happy Path\""},"step_count":{"type":"integer","description":"Initial step columns (default 5, or the number of step_names)","minimum":1},"step_names":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"description":"Step name"},"description":"Initial step names in order; step_count must match when supplied"},"lane_source_path_id":{"type":"string","description":"Path id whose lanes to copy; omit for none"}},"required":["phase_id","name"],"additionalProperties":false},"create_path":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"lane_source_path_id":{"type":"string","description":"Sibling path id whose lanes to copy; omit for none"}},"required":["scenario_id","name"],"additionalProperties":false},"duplicate_path":{"type":"object","properties":{"source_path_id":{"type":"string","minLength":1,"description":"Path to copy"},"name":{"type":"string","minLength":1,"description":"New path name"},"kind":{"type":"string","enum":["happy","variant","exception"],"description":"Default variant"},"copy_cells":{"type":"boolean","description":"Default true"}},"required":["source_path_id","name"],"additionalProperties":false},"duplicate_scenario":{"type":"object","properties":{"source_scenario_id":{"type":"string","minLength":1,"description":"Scenario id from list_blueprint"},"name":{"type":"string","minLength":1,"description":"Name for the copy; the UI convention is \"<source name> (copy)\""}},"required":["source_scenario_id","name"],"additionalProperties":false},"create_slice":{"type":"object","properties":{"title":{"type":"string","minLength":1,"description":"Slice title"},"summary":{"type":"string","description":"One-line summary; omit for none"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"Kind of cut"},"actor":{"type":"string","description":"Whose view this is; omit for none"},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Existing cell ids, in journey order"}},"required":["title","kind","cell_ids"],"additionalProperties":false},"update_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"},"title":{"type":"string","description":"omit to keep"},"summary":{"type":"string","description":"omit to keep"},"actor":{"type":"string","description":"omit to keep"},"kind":{"type":"string","enum":["journey","lane","step","custom"],"description":"omit to keep"}},"required":["slice_id"],"additionalProperties":false},"replace_slides":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id"},"slides":{"type":"array","items":{"type":"object","properties":{"cells":{"type":"array","items":{"type":"string"},"description":"Cell ids on this slide"},"title":{"type":"string","description":"Slide title; omit for none"},"caption":{"type":"string","description":"Slide caption; omit for none"}},"required":["cells"],"additionalProperties":false},"description":"Full replacement, in order"}},"required":["slice_id","slides"],"additionalProperties":false},"share_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"}},"required":["slice_id"],"additionalProperties":false},"unshare_slice":{"type":"object","properties":{"slice_id":{"type":"string","minLength":1,"description":"Slice id from list_slices"}},"required":["slice_id"],"additionalProperties":false},"create_step":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"Short label for what happens; put the explanation in summary"},"summary":{"type":"string","description":"Explanation of this step; an empty string leaves it blank; omit for none"},"at_position":{"type":"integer","description":"Insert position (1-based); omit to append","minimum":0}},"required":["path_id","name"],"additionalProperties":false},"create_lane":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Lane label"},"lane_role":{"type":"string","description":"Semantic role (e.g. frontstage_actions, backstage_touchpoints); omit if none fits","enum":["customer_actions","frontstage_actions","backstage_actions","partner_actions","frontstage_touchpoints","backstage_touchpoints","support_actions","storyboard"]},"at_position":{"type":"integer","description":"Insert row (1-based); omit to append","minimum":0}},"required":["scenario_id","name"],"additionalProperties":false},"upsert_cell":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"lane_id":{"type":"string","minLength":1,"description":"Lane id from get_blueprint"},"step_id":{"type":"string","minLength":1,"description":"Step id (from get_blueprint)"},"content":{"type":"string","minLength":1,"description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\"."}},"required":["path_id","lane_id","step_id","content"],"additionalProperties":false},"update_cell":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell id"},"content":{"type":"string","description":"The cell text — a journey moment, not a system capability. Aim for the canvas budget: the canvas reads at a glance and shows what fits, so put detail in the summary. Longer text is written in full and comes back with a note naming the thresholds. Good: \"Dispatcher confirms the address and books a crew\". Bad: \"Scheduling module\".; omit to keep"},"summary":{"type":"string","description":"The tl;dr — never a copy of the text; omit to keep"},"owner":{"type":"string","description":"Owner tag — the team accountable (reuse a tag from list_owner_tags unless starting a new one deliberately); omit to keep"},"perceived_owner":{"type":"string","description":"Perceived-owner tag — who the person on the other side thinks they are dealing with (reuse a tag from list_owner_tags unless starting a new one deliberately); omit to keep"},"function":{"type":"string","description":"What this cell has to accomplish; omit to keep"},"form":{"type":"string","description":"How it comes across; omit to keep"},"value_props":{"type":"array","items":{"type":"object","properties":{"for":{"type":"string","description":"Audience"},"value":{"type":"string","description":"The value delivered"}},"required":["for","value"],"additionalProperties":false},"description":"Full replacement list of {for, value} — who gets what from it; omit to keep"}},"required":["cell_id"],"additionalProperties":false},"create_cell_dependency":{"type":"object","properties":{"source_cell_id":{"type":"string","minLength":1,"description":"Source cell id"},"target_cell_id":{"type":"string","minLength":1,"description":"Target cell id"},"kind":{"type":"string","enum":["leads_to","enables"],"description":"Default leads_to"},"label":{"type":"string","description":"Anything worth knowing about this dependency, in a sentence. Saved as the edge NOTE and shown on its row in the cell panel — it is not a badge on the arrow. The argument keeps its published spelling; what it writes is the note. Omit for none"}},"required":["source_cell_id","target_cell_id"],"additionalProperties":false},"update_path":{"type":"object","properties":{"path_id":{"type":"string","minLength":1,"description":"Path id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["path_id","name"],"additionalProperties":false},"update_phase":{"type":"object","properties":{"phase_id":{"type":"string","minLength":1,"description":"Phase id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["phase_id","name"],"additionalProperties":false},"update_scenario":{"type":"object","properties":{"scenario_id":{"type":"string","minLength":1,"description":"Scenario id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["scenario_id","name"],"additionalProperties":false},"update_step":{"type":"object","properties":{"step_id":{"type":"string","minLength":1,"description":"Step id"},"name":{"type":"string","minLength":1,"description":"Short label; put the explanation in summary"},"summary":{"type":"string","description":"Explanation; an empty string clears it; omit to keep"}},"required":["step_id","name"],"additionalProperties":false},"update_lane":{"type":"object","properties":{"lane_id":{"type":"string","minLength":1,"description":"Lane id"},"name":{"type":"string","minLength":1,"description":"New name"}},"required":["lane_id","name"],"additionalProperties":false},"create_evidence":{"type":"object","properties":{"cell_id":{"type":"string","minLength":1,"description":"Cell the source supports"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other"},"title":{"type":"string","minLength":1,"description":"What the source IS, e.g. \"Onboarding interview #4\" — required"},"note":{"type":"string","description":"Anything worth keeping about the source — a quotation, an observation, or a URL, which renders as a link; omit if none"}},"required":["cell_id","kind","title"],"additionalProperties":false},"update_evidence":{"type":"object","properties":{"evidence_id":{"type":"string","minLength":1,"description":"Evidence id from list_evidence"},"kind":{"type":"string","enum":["interview","survey","analytics","doc","meeting","decision","observation","other"],"description":"interview | survey | analytics | doc | meeting | decision | observation | other; omit to keep"},"title":{"type":"string","description":"New title; omit to keep"},"note":{"type":"string","description":"New note; omit to keep"}},"required":["evidence_id"],"additionalProperties":false},"create_finding":{"type":"object","properties":{"source":{"type":"string","enum":["audit","whatif"],"description":"Which skill produced it"},"check_key":{"type":"string","minLength":1,"description":"Roster check key, e.g. \"gap-sweep\""},"severity":{"type":"string","enum":["info","warn","critical"],"description":"Per the check doc default unless evidence says otherwise"},"impact":{"type":"string","enum":["low","medium","high"],"description":"How much fixing it matters to the service, rated from the check doc''s rubric. Required on every finding."},"effort":{"type":"string","enum":["low","medium","high"],"description":"How much work the fix takes, rated from the check doc''s rubric. Required on every finding."},"summary":{"type":"string","minLength":1,"description":"The finding itself — what is wrong, where, and why it matters. No raw ids in this text."},"cell_ids":{"type":"array","items":{"type":"string"},"description":"Cells the finding is about; omit only for zero-cell findings"},"scope":{"type":"string","description":"Zero-cell fingerprint scope, required when cell_ids is empty. Include a short reason slug so two zero-cell findings from one check cannot collide, e.g. \"scenario:Intake Call:orphan-step-cooldown\""},"run_id":{"type":"string","description":"The run identity returned by the first create_finding of this run"}},"required":["source","check_key","severity","impact","effort","summary"],"additionalProperties":false},"update_finding":{"type":"object","properties":{"finding_id":{"type":"string","minLength":1,"description":"Finding id from list_findings"},"status":{"type":"string","enum":["open","resolved","dismissed"],"description":"New status"}},"required":["finding_id","status"],"additionalProperties":false},"approve_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false},"decline_suggested_change":{"type":"object","properties":{"suggested_change_id":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"}},"required":["suggested_change_id"],"additionalProperties":false}}'::jsonb $contracts$;
-- END DERIVED WRITE CONTRACTS

-- BEGIN DERIVED SERVICE REFUSAL
create or replace function public.agent_service_required_message() returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $message$ select 'Choose service_id from list_services. If none exists, propose create_service and ask someone who may approve for a yes.'::text $message$;
revoke all on function public.agent_service_required_message() from public;
-- END DERIVED SERVICE REFUSAL

comment on column public.profiles.may_approve is
  'Whether this person approves changes to the blueprint and makes a cell approved. Set by an operator, never by the person.';
comment on column public.cells.approved_by is
  'The profile that approved this cell''s value: set when someone who may approve approves a change to it or approves it as it stands. Null when nobody has. An approved cell outranks anything Uno inferred.';
comment on column public.cells.approved_at is
  'When approved_by approved this cell''s value. Set with it, cleared with it.';
comment on table public.profiles is
  'One person who talks to Uno: the stakeholder they are in the business, how Uno works with them, and whether they may approve. Not a stakeholder: the stakeholder says who someone is, the profile says how Uno works with them. A person reads and edits only their own; list_profile_stakeholders shows everyone''s stakeholder link.';
comment on table public.suggested_changes is
  'A change to a cell''s content that someone who may not approve suggested, waiting for someone who may. Written and decided through record_contribution and approve_suggested_change only.';
comment on function public.approving_profile_id() is
  'Guard: the caller''s profile id, refused unless that profile may approve.';
comment on function public.approve_cell(uuid) is
  'Approve a cell as it stands, in the caller''s name. Refused unless the caller''s profile may approve.';
comment on function public.decline_suggested_change(uuid) is
  'Guard: the caller''s profile must hold may_approve. Declines a pending suggestion without changing its cell.';
comment on function public.approve_cell_content_suggestion(uuid) is
  'Apply a pending suggested change to its cell and approve the cell in the caller''s name. Refused unless the caller''s profile may approve.';

revoke all on function public.approving_profile_id(), public.approve_cell(uuid) from public;

-- Proof: no core function body or comment says an old name, and the guard
-- refuses with the new sentence.
do $proof$
declare
  stale text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into stale from pg_proc p
    where p.oid in (
      'public.approving_profile_id()'::regprocedure,
      'public.approve_cell(uuid)'::regprocedure,
      'public.decline_suggested_change(uuid)'::regprocedure,
      'public.approve_cell_content_in_session(uuid,uuid)'::regprocedure,
      'public.approve_proposal_in_session(uuid,uuid)'::regprocedure,
      'public.run_agent_tool(text,jsonb,uuid,uuid,boolean)'::regprocedure,
      'public.agent_service_required_message()'::regprocedure,
      'public.agent_tool_transaction(text,jsonb,uuid,uuid,boolean,uuid)'::regprocedure)
      and p.prosrc ~* '(may_confirm|confirmed_by|confirmed_at|confirming_profile_id|confirm_cell|may confirm)';
  if stale is not null then raise exception 'proof: % still name the old approval words', stale; end if;
  if exists (select from pg_description d where d.classoid in ('pg_proc'::regclass, 'pg_class'::regclass)
      and d.description ~* '(may confirm|owner-confirm|may_confirm|confirmed_by)') then
    raise exception 'proof: a comment still says the old approval words';
  end if;
  if not exists (select from pg_proc where oid = 'public.approving_profile_id()'::regprocedure
      and prosrc like '%only someone who may approve can approve a change or a cell%') then
    raise exception 'proof: the approval guard lost its refusal';
  end if;
end
$proof$;

-- @recipe — the renamed functions keep their callers: a signed-in person
-- approves a cell; nobody calls the guard directly.
revoke execute on function public.approving_profile_id() from public, anon, authenticated;
revoke execute on function public.approve_cell(uuid) from public, anon;
grant execute on function public.approve_cell(uuid) to authenticated;

do $grant_proof$
begin
  if has_function_privilege('anon', 'public.approve_cell(uuid)', 'execute')
      or has_function_privilege('anon', 'public.approving_profile_id()', 'execute')
      or has_function_privilege('authenticated', 'public.approving_profile_id()', 'execute') then
    raise exception 'proof: a caller can reach the approval guard directly';
  end if;
  if not has_function_privilege('authenticated', 'public.approve_cell(uuid)', 'execute') then
    raise exception 'proof: a signed-in person cannot approve a cell';
  end if;
  if exists (
    select from pg_attribute a join pg_class c on c.oid = a.attrelid
    cross join lateral aclexplode(coalesce(a.attacl, '{}'::aclitem[]) || coalesce(c.relacl, '{}'::aclitem[])) x
    where (a.attrelid = 'public.profiles'::regclass and a.attname = 'may_approve'
      or a.attrelid = 'public.cells'::regclass and a.attname in ('approved_by', 'approved_at'))
      and x.privilege_type = 'UPDATE' and x.grantee <> c.relowner
  ) then
    raise exception 'proof: a role holds UPDATE on a renamed approval column';
  end if;
end
$grant_proof$;
-- @core
