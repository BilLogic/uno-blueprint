#!/usr/bin/env python3
"""Deterministic audit mechanics — fingerprint, dedupe, export, report, rank.

The audit's two most correctness-critical steps (fingerprint identity and
the dedupe decision) must never be improvised per run: two agents
hand-rolling them will disagree on a separator or a status rule and split
the finding history. This script IS the reference implementation of
audit-playbook §2 (fingerprint) and §3 (dedupe table), plus the §1 export
and the no-DB findings-report substrate.

Usage:
    python3 skills/audit/scripts/audit_tools.py fingerprint --check gap-sweep \
        --cell-keys k1 k2 ... --reason <slug>  # or --scope "sample-service:orphan-step"
    python3 skills/audit/scripts/audit_tools.py export <ir-file> [--scenario <key>] \
        --out audit/export-<scenario>.json
    python3 skills/audit/scripts/audit_tools.py dedupe --ledger audit/findings-report.json \
        --incoming <findings.json>          # prints actions, applies nothing
    python3 skills/audit/scripts/audit_tools.py report --ledger audit/findings-report.json \
        --incoming <findings.json> --run-id <uuid> --apply
        # applies §3 to the file ledger (the no-DB route substrate)
    python3 skills/audit/scripts/audit_tools.py validate <findings.json>
        # the collect stage's shape check; dedupe and report run it too
    python3 skills/audit/scripts/audit_tools.py rank --ledger audit/findings-report.json
        # prints the open findings in priority order, then per-check counts

Stdlib only. Exit 0 on success; 1 on bad input.

Fingerprint form (audit-playbook §2): EVERY finding carries a reason slug —
    cell-bearing: check_key + ':' + sha256(sorted cell_keys) + ':' + <reason-slug>
    zero-cell:    check_key + ':scope:' + <scope-key> + ':' + <reason-slug>
(the zero-cell scope value already ends in its reason slug). Without the
slug, two findings from one check over the same cells collide and dedupe
silently destroys one of them.

Migration note (existing ledgers): rows carrying old-form fingerprints
(no reason slug) remain valid rows — dedupe compares exact fingerprint
strings, so old rows simply never match new-form incoming findings and no
ledger rewrite is needed. New writes always use the new form; per-check
supersede retires the old-form open rows on the next completed run.

Findings JSON shape (both incoming and ledger rows):
    {"check_key": str, "severity": "info|warn|critical",
     "impact": "low|medium|high", "effort": "low|medium|high", "summary": str,
     "cell_keys": [str, ...],
     "reason": str (short reason slug — required when cell_keys is non-empty),
     "scope": str|null ("<scope-key>:<reason-slug>" — required when cell_keys is empty),
     "source": "audit|whatif",
     "fingerprint": str (computed here — never hand-written),
     "status": "open|resolved|dismissed", "run_id": str}
The ledger file is {"rows": [row, ...]}.

Every INCOMING finding carries severity, impact and effort; one missing any
of the three, or carrying a value outside its set, fails the batch before
anything is planned. Ledger rows recorded before impact and effort existed
lack them and stay valid: they print as unrated and sort last.

Priority order (audit-playbook §3.5), the order `rank` prints:
    Do first    high impact, low effort
    Plan        high impact, medium or high effort
    Quick wins  medium or low impact, low effort
    Later       everything else, unrated rows included
Within a group: impact desc, then effort asc, then severity desc.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

SEVERITIES = ("info", "warn", "critical")
RATINGS = ("low", "medium", "high")
GROUPS = ("Do first", "Plan", "Quick wins", "Later")


def fingerprint(
    check_key: str, cell_keys: list[str], scope: str | None, reason: str | None = None
) -> str:
    """audit-playbook §2, exactly. EVERY finding carries a reason slug so
    two distinct findings from one check over the same cells (or the same
    scope) cannot collide."""
    if cell_keys:
        if not reason:
            raise ValueError(
                "cell-bearing finding needs a reason slug (--reason / \"reason\") — "
                "without it, two findings from one check over the same cells collide"
            )
        digest = hashlib.sha256("\n".join(sorted(cell_keys)).encode("utf-8")).hexdigest()
        return f"{check_key}:{digest}:{reason}"
    if not scope:
        raise ValueError("zero-cell finding needs --scope 'scope-key:reason-slug'")
    return f"{check_key}:scope:{scope}"


def dedupe_action(existing_rows: list[dict], fp: str) -> str:
    """audit-playbook §3: nothing -> insert; open -> update; dismissed ->
    drop; resolved -> reopen. Dismissed wins over resolved (a human said no)."""
    statuses = {row["status"] for row in existing_rows if row.get("fingerprint") == fp}
    if "open" in statuses:
        return "update"
    if "dismissed" in statuses:
        return "drop"
    if "resolved" in statuses:
        return "reopen"
    return "insert"


def finding_problems(finding: dict) -> list[str]:
    """What keeps one incoming finding out of a batch — empty when it is
    well formed. Severity, impact and effort are each required and closed:
    a rating left to a default is a judgement nobody made."""
    if not isinstance(finding, dict):
        return [f"a finding must be an object, got {type(finding).__name__}"]
    problems = []
    if not finding.get("check_key"):
        problems.append("check_key is missing")
    for field, allowed in (("severity", SEVERITIES), ("impact", RATINGS), ("effort", RATINGS)):
        value = finding.get(field)
        if value is None:
            problems.append(f"{field} is missing")
        elif value not in allowed:
            problems.append(
                f"{field} {value!r} is not one of {', '.join(allowed[:-1])} or {allowed[-1]}"
            )
    return problems


def validate_findings(findings: list) -> None:
    """Refuse the whole batch on the first malformed finding, naming it."""
    for index, finding in enumerate(findings):
        problems = finding_problems(finding)
        if problems:
            check = finding.get("check_key", "?") if isinstance(finding, dict) else "?"
            raise ValueError(
                f"finding {index} ({check}) is malformed: {'; '.join(problems)}"
            )


def priority_group(finding: dict) -> str:
    """Which of the four report groups a finding falls in. A row without
    both ratings is unrated and falls in Later."""
    impact, effort = finding.get("impact"), finding.get("effort")
    if impact not in RATINGS or effort not in RATINGS:
        return "Later"
    if impact == "high":
        return "Do first" if effort == "low" else "Plan"
    if effort == "low":
        return "Quick wins"
    return "Later"


def _priority_key(finding: dict) -> tuple:
    impact, effort = finding.get("impact"), finding.get("effort")
    rated = impact in RATINGS and effort in RATINGS
    severity = finding.get("severity")
    return (
        0 if rated else 1,  # unrated last, whatever its severity
        -RATINGS.index(impact) if rated else 0,
        RATINGS.index(effort) if rated else 0,
        -SEVERITIES.index(severity) if severity in SEVERITIES else 1,
        finding.get("check_key") or "",
        finding.get("fingerprint") or "",
    )


def rank(findings: list[dict]) -> list[tuple[str, list[dict]]]:
    """The findings in report order: the four groups, always all four and
    always in this order, each sorted impact desc, effort asc, severity
    desc. The last two keys only make the order stable."""
    grouped: dict[str, list[dict]] = {group: [] for group in GROUPS}
    for finding in findings:
        grouped[priority_group(finding)].append(finding)
    return [(group, sorted(grouped[group], key=_priority_key)) for group in GROUPS]


def rating_label(finding: dict) -> str:
    """`impact high · effort low`, or `unrated` for a row with either missing."""
    impact, effort = finding.get("impact"), finding.get("effort")
    if impact not in RATINGS or effort not in RATINGS:
        return "unrated"
    return f"impact {impact} · effort {effort}"


def _read_json(path: Path, label: str):
    """Every JSON read goes through here so a malformed or missing file exits
    with the same `error: ...` line the other subcommands print, not a
    traceback the calling agent has to interpret."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as error:
        raise ValueError(f"cannot read {label} {str(path)!r}: {error.strerror}") from error
    except json.JSONDecodeError as error:
        raise ValueError(
            f"{label} {str(path)!r} is not valid JSON (line {error.lineno}, "
            f"column {error.colno}): {error.msg}"
        ) from error


def load_ir(path: Path) -> dict:
    return _read_json(path, "IR")


def _read_findings(path: Path) -> list[dict]:
    findings = _read_json(path, "findings file")
    if not isinstance(findings, list):
        raise ValueError(
            f"findings file {str(path)!r} must be a JSON array of findings, "
            f"got {type(findings).__name__}"
        )
    return findings


def cmd_fingerprint(args: argparse.Namespace) -> int:
    try:
        print(fingerprint(args.check, args.cell_keys or [], args.scope, args.reason))
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    ir = load_ir(Path(args.ir))
    service = ir.get("service", {})
    if args.scenario:
        # Build a filtered copy — never mutate the loaded IR in place (a
        # caller holding the dict would silently lose scenarios).
        phases = []
        for phase in service.get("phases", []):
            scenarios = [
                scenario
                for scenario in phase.get("scenarios", [])
                if scenario.get("key") == args.scenario
            ]
            if scenarios:
                phases.append({**phase, "scenarios": scenarios})
        if not phases:
            print(f"error: no scenario with key {args.scenario!r}", file=sys.stderr)
            return 1
        service = {**service, "phases": phases}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"schema_version": ir.get("schema_version"), "service": service},
                   ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    print(f"export written: {out}")
    return 0


def _load_ledger(path: Path) -> dict:
    if not path.exists():
        return {"rows": []}
    ledger = _read_json(path, "ledger")
    if not isinstance(ledger, dict) or not isinstance(ledger.get("rows"), list):
        raise ValueError(f"ledger {str(path)!r} must be an object with a 'rows' array")
    return ledger


def _plan(ledger: dict, incoming: list[dict], run_id: str | None) -> list[tuple[str, dict]]:
    validate_findings(incoming)
    plan: list[tuple[str, dict]] = []
    seen: set[str] = set()
    for finding in incoming:
        fp = fingerprint(
            finding["check_key"],
            finding.get("cell_keys") or [],
            finding.get("scope"),
            finding.get("reason"),
        )
        if fp in seen:
            raise ValueError(
                f"duplicate fingerprint within the incoming batch: {fp!r} — two "
                "findings in one batch share a fingerprint; give each a distinct "
                "reason slug (never plan two inserts for one identity)"
            )
        seen.add(fp)
        finding = {**finding, "fingerprint": fp}
        if run_id:
            finding["run_id"] = run_id
        plan.append((dedupe_action(ledger["rows"], fp), finding))
    return plan


def cmd_dedupe(args: argparse.Namespace) -> int:
    ledger = _load_ledger(Path(args.ledger))
    incoming = _read_findings(Path(args.incoming))
    for action, finding in _plan(ledger, incoming, None):
        print(f"{action:7s} {finding['fingerprint']}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    ledger_path = Path(args.ledger)
    ledger = _load_ledger(ledger_path)
    incoming = _read_findings(Path(args.incoming))
    counts = {"insert": 0, "update": 0, "drop": 0, "reopen": 0}
    for action, finding in _plan(ledger, incoming, args.run_id):
        counts[action] += 1
        if not args.apply:
            continue
        rows = ledger["rows"]
        if action == "insert":
            rows.append({**finding, "status": "open"})
        elif action in ("update", "reopen"):
            for row in rows:
                if row["fingerprint"] == finding["fingerprint"] and row["status"] in (
                    "open" if action == "update" else "resolved",
                ):
                    row.update(
                        {
                            k: finding[k]
                            for k in ("severity", "impact", "effort", "summary", "run_id")
                            if k in finding
                        }
                    )
                    row["status"] = "open"
                    break
        # drop: nothing lands — dismissed stays dismissed.
    if args.apply:
        # File-ledger backstop, mirroring the DB partial unique index
        # (findings_open_fingerprint_idx): never write two open rows with
        # one fingerprint. A violation means the dedupe logic missed.
        open_fps = [row["fingerprint"] for row in ledger["rows"] if row["status"] == "open"]
        duplicates = sorted({fp for fp in open_fps if open_fps.count(fp) > 1})
        if duplicates:
            raise ValueError(
                "refusing to write the ledger: duplicate open fingerprints "
                f"{duplicates!r} — the open-fingerprint backstop (mirror of the DB "
                "partial unique index) treats this as a dedupe miss, not an insert"
            )
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text(
            json.dumps(ledger, ensure_ascii=False, indent=1), encoding="utf-8"
        )
    print(json.dumps({"applied": bool(args.apply), **counts}))
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    validate_findings(_read_findings(Path(args.findings)))
    print("findings valid")
    return 0


def cmd_rank(args: argparse.Namespace) -> int:
    rows = _load_ledger(Path(args.ledger))["rows"]
    if args.status != "all":
        rows = [row for row in rows if row.get("status") == args.status]
    for group, members in rank(rows):
        print(group)
        if not members:
            print("  (none)")
        for row in members:
            cells = len(row.get("cell_keys") or [])
            summary = row.get("summary") or row.get("note") or ""
            print(
                f"  [{row.get('severity', '?')} · {rating_label(row)}] "
                f"{row.get('check_key', '?')} (cells: {cells}) — {summary}"
            )
    counts: dict[str, int] = {}
    for row in rows:
        check = row.get("check_key", "?")
        counts[check] = counts.get(check, 0) + 1
    print("Per check")
    if not counts:
        print("  (none)")
    for check in sorted(counts):
        print(f"  {check}: {counts[check]}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("fingerprint")
    p.add_argument("--check", required=True)
    p.add_argument("--cell-keys", nargs="*")
    p.add_argument("--reason", help="reason slug — required with --cell-keys")
    p.add_argument("--scope")
    p.set_defaults(fn=cmd_fingerprint)

    p = sub.add_parser("export")
    p.add_argument("ir")
    p.add_argument("--scenario")
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_export)

    p = sub.add_parser("dedupe")
    p.add_argument("--ledger", required=True)
    p.add_argument("--incoming", required=True)
    p.set_defaults(fn=cmd_dedupe)

    p = sub.add_parser("report")
    p.add_argument("--ledger", required=True)
    p.add_argument("--incoming", required=True)
    p.add_argument("--run-id", required=True)
    p.add_argument("--apply", action="store_true")
    p.set_defaults(fn=cmd_report)

    p = sub.add_parser("validate")
    p.add_argument("findings")
    p.set_defaults(fn=cmd_validate)

    p = sub.add_parser("rank")
    p.add_argument("--ledger", required=True)
    p.add_argument("--status", default="open", choices=("open", "resolved", "dismissed", "all"))
    p.set_defaults(fn=cmd_rank)

    args = parser.parse_args()
    try:
        return args.fn(args)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
