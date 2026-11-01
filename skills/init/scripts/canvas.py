#!/usr/bin/env python3
"""Show a business's blueprint in the canvas, when a person asks to see it.

Usage:
    python3 skills/init/scripts/canvas.py start [--port 5173] [--wait 60]
        # starts the canvas on this machine against the project in .env
        # {url, project, pid, log, stop}; refused while .env carries a service key
    python3 skills/init/scripts/canvas.py share --to netlify|github \
        [--repo <name>] [--visibility private|public] [--yes]
        # without --yes: the plan — what becomes public, the person's own step,
        #   the command to run on their yes. Runs nothing, reaches no network.
        # with --yes: deploys to the person's Netlify site and checks the built
        #   page names the project, or creates a GitHub repository in their
        #   account and pushes the workspace's commits to it.

Every command takes `--workspace <path>` (default: the current directory).

The canvas reads its project from `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. `start` reads them from the workspace's `.env`
files as Vite does. A Netlify deploy reads them from the person's own site
settings: this script checks the names are there and name the same project,
and never sets one. No key value is ever printed.

Stdlib only. Exit 0 on success; 1 when a step is refused or the person has a
step to take first; 2 on bad usage.
"""
import argparse
import json
import os
import shlex
import signal
import socket
import subprocess
import sys
import tempfile
import time
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

PROJECT_KEYS = ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY")
# Vite's own order per mode: later files win, the shell wins over all.
ENV_FILES = {
    "development": (".env", ".env.local", ".env.development", ".env.development.local"),
    "production": (".env", ".env.local", ".env.production", ".env.production.local"),
}
SERVICE_KEY = "VITE_SUPABASE_DEV_SERVICE_KEY"
SETTINGS_STEP = (
    "In Netlify, open the site, then Site configuration, then Environment variables, "
    "and add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY with the values from the "
    "Supabase project's Settings, API page. Uno does not put a key into a hosting dashboard."
)


class Refused(Exception):
    """A step the script will not take, or one the person takes first."""


def env_value(raw):
    raw = raw.strip()
    if raw[:1] in ("'", '"') and raw.count(raw[0]) >= 2:
        return raw[1:raw.index(raw[0], 1)]
    return raw.split(" #", 1)[0].strip()


def read_env_files(workspace, mode="development"):
    values = {}
    for name in ENV_FILES[mode]:
        path = workspace / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.removeprefix("export ").split("=", 1)
            values[key.strip()] = env_value(value)
    for key in (*PROJECT_KEYS, SERVICE_KEY):
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def project_host(url):
    return urlparse(url).hostname if url and "://" in url else None


def workspace_project(workspace, mode="development"):
    values = read_env_files(workspace, mode)
    if mode == "development" and values.get(SERVICE_KEY):
        raise Refused(
            f"The workspace's .env files set {SERVICE_KEY}: a canvas started with it writes with "
            "full database access, past who may confirm. An operator removes it before Uno starts the canvas."
        )
    host = project_host(values.get("VITE_SUPABASE_URL"))
    if not host or not values.get("VITE_SUPABASE_ANON_KEY"):
        raise Refused(
            "No VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the workspace's .env: "
            "the canvas would show the bundled sample, not this business. An operator "
            "fills them from the Supabase project's Settings, API page."
        )
    return host


def port_is_free(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            return False
    return True


DIRECT = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def fetch(url, timeout=10):
    with DIRECT.open(url, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def answers(url):
    try:
        with DIRECT.open(url, timeout=2):
            return True
    except urllib.error.HTTPError:
        return True
    except (urllib.error.URLError, OSError):
        return False


def start(args):
    workspace = args.workspace
    host = workspace_project(workspace)
    package = workspace / "package.json"
    try:
        scripts = json.loads(package.read_text()).get("scripts", {}) if package.is_file() else {}
    except json.JSONDecodeError:
        scripts = {}
    if "dev" not in scripts:
        raise Refused(f"{workspace} has no package.json with a dev script; it is not a canvas workspace.")
    if not (workspace / "node_modules").is_dir():
        raise Refused(f"The canvas is not installed in {workspace}; run `npm ci` there first.")
    if not port_is_free(args.port):
        raise Refused(f"Port {args.port} is in use; pass --port with a free one.")
    handle, name = tempfile.mkstemp(prefix=f"uno-canvas-{args.port}-", suffix=".log")
    log = Path(name)
    with os.fdopen(handle, "w") as out:
        server = subprocess.Popen(
            ["npm", "run", "dev", "--", "--port", str(args.port), "--strictPort", "--host", "127.0.0.1"],
            cwd=workspace, stdout=out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            start_new_session=True,
        )
    local = f"http://127.0.0.1:{args.port}/"
    deadline = time.monotonic() + args.wait
    while not answers(local):
        if server.poll() is not None or time.monotonic() > deadline:
            if server.poll() is None:
                os.killpg(server.pid, signal.SIGTERM)
            tail = "\n".join(log.read_text(errors="replace").splitlines()[-15:])
            raise Refused(f"The canvas did not start; the last lines of {log}:\n{tail}")
        time.sleep(0.3)
    return {
        "url": local,
        "project": host,
        "pid": server.pid,
        "log": str(log),
        "stop": f"kill -- -{server.pid}",
    }


def run_tool(command, workspace, env=None):
    return subprocess.run(command, cwd=workspace, capture_output=True, text=True, env=env)


def committed_files(workspace):
    """The files the last commit holds, or None before the first commit."""
    done = run_tool(["git", "ls-tree", "-r", "-z", "--name-only", "HEAD"], workspace)
    if done.returncode != 0:
        return None
    return [name for name in done.stdout.split("\0") if name]


def env_files_in_history(workspace):
    """Every .env file any commit ever held: a push carries the whole history."""
    done = run_tool(["git", "log", "--all", "--name-only", "--format="], workspace)
    names = {line for line in done.stdout.splitlines() if line}
    return sorted(name for name in names
                  if Path(name).name.startswith(".env") and Path(name).name != ".env.example")


def parse_json(text, what):
    """CLI output as JSON; a tool that mixes logs into stdout ends with the object."""
    for start in (0, text.rfind("\n{") + 1):
        try:
            return json.loads(text[start:])
        except json.JSONDecodeError:
            continue
    raise Refused(f"{what} did not answer in JSON; run it by hand to see why.")


def bundle_names(url, host):
    """Whether the deployed page's scripts carry the project's host; None if unreadable."""
    try:
        page = fetch(url)
        scripts = re.findall(r'<script[^>]+src="([^"]+)"', page)
        return any(host in fetch(urllib.parse.urljoin(url, src)) for src in scripts)
    except (urllib.error.URLError, OSError, ValueError):
        return None


def on_yes(args, *extra):
    return shlex.join(["python3", "skills/init/scripts/canvas.py", "share", "--to", args.to,
                       *extra, "--workspace", str(args.workspace), "--yes"])


def tracked_summary(files):
    groups = {}
    for name in files:
        top = name.split("/", 1)[0] + ("/" if "/" in name else "")
        groups[top] = groups.get(top, 0) + 1
    return ", ".join(f"{top} ({count} file{'s' if count != 1 else ''})" for top, count in sorted(groups.items()))


def netlify_plan(args):
    workspace_project(args.workspace, "production")
    return {
        "to": "netlify",
        "becomes_public": [
            "The canvas at the site's address: anyone with the link can open it.",
            "Everything the business's Supabase project lets a signed-out visitor read, which "
            "is every blueprint table: each service's steps, lanes and cells; the evidence "
            "behind them, excerpts of the documents and conversations they came from; the "
            "edit history with who made each edit; findings, slices, and deleted items.",
            "The project's address and its anon key, which every page carries; a "
            "signed-out visitor cannot write.",
            "Netlify password protection is a paid feature; the free alternatives are "
            "in skills/map/references/deploy-notes.md.",
        ],
        "before": [
            "The person signs in: `netlify login`.",
            "The person links this workspace to a site they own: `netlify link`, or `netlify sites:create`.",
        ],
        "person_step": SETTINGS_STEP,
        "on_yes": on_yes(args),
    }


def netlify_deploy(args):
    workspace = args.workspace
    host = workspace_project(workspace, "production")
    listed = run_tool(["netlify", "env:list", "--json", "--context", "production"], workspace)
    if listed.returncode != 0:
        raise Refused(
            "Netlify is not signed in, or this workspace is not linked to a site the person owns. "
            "The person runs `netlify login`, then `netlify link` in the workspace; then ask again."
        )
    settings = parse_json(listed.stdout or "{}", "`netlify env:list`")
    missing = [key for key in PROJECT_KEYS if not settings.get(key)]
    if missing:
        raise Refused(f"The site's settings lack {' and '.join(missing)}. {SETTINGS_STEP}")
    theirs = project_host(settings["VITE_SUPABASE_URL"])
    if theirs != host:
        raise Refused(
            f"The site's settings name the project {theirs or 'by an unreadable address'}, "
            f"but this workspace is linked to {host}. "
            "The person corrects VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the site's settings."
        )
    # The build takes the project from the site's settings; none of ours rides along.
    env = {key: value for key, value in os.environ.items() if not key.startswith("VITE_SUPABASE_")}
    deployed = run_tool(["netlify", "deploy", "--build", "--prod", "--json"], workspace, env)
    if deployed.returncode != 0:
        tail = "\n".join((deployed.stderr or deployed.stdout).splitlines()[-15:])
        raise Refused(f"The deploy failed:\n{tail}")
    result = parse_json(deployed.stdout, "`netlify deploy`")
    url = result.get("url")
    return {"to": "netlify", "url": url, "deploy_url": result.get("deploy_url"), "project": host,
            "page_names_project": bundle_names(url, host) if url else None}


def github_plan(args):
    files = committed_files(args.workspace)
    readers = ("Anyone on the internet" if args.visibility == "public"
               else "You and the people you add to the repository")
    public = (
        [f"{readers} can read every committed file: {tracked_summary(files)}."]
        if files else ["The workspace has no commits yet; commit it before the push."]
    )
    public += [
        "Uncommitted changes and files git ignores, .env among them, stay on this machine.",
        "A repository holds files, not a running canvas; to share a link, connect it to a "
        "Netlify site, whose settings take the project's two values from the person.",
    ]
    repo = args.repo or args.workspace.name
    return {
        "to": "github",
        "visibility": args.visibility,
        "repo": repo,
        "becomes_public": public,
        "before": ["The person signs in: `gh auth login`."],
        "person_step": "None for the push: the repository needs no key.",
        "on_yes": on_yes(args, "--repo", repo, "--visibility", args.visibility),
    }


def github_push(args):
    workspace = args.workspace
    if not committed_files(workspace):
        raise Refused("The workspace has no commits to push; commit it first.")
    leaked = env_files_in_history(workspace)
    if leaked:
        raise Refused(f"{', '.join(leaked)} is in the git history and would carry keys; "
                      "remove it from every commit first.")
    if run_tool(["gh", "auth", "status"], workspace).returncode != 0:
        raise Refused("GitHub is not signed in. The person runs `gh auth login`; then ask again.")
    repo = args.repo or workspace.name
    created = run_tool(
        ["gh", "repo", "create", repo, f"--{args.visibility}", f"--source={workspace}", "--remote=business", "--push"],
        workspace,
    )
    if created.returncode != 0:
        raise Refused(f"The repository was not created: {created.stderr.strip()}")
    lines = [line for line in created.stdout.splitlines() if line.startswith("https://")]
    return {"to": "github", "url": lines[-1] if lines else None, "visibility": args.visibility}


def share(args):
    if args.to == "netlify":
        return netlify_deploy(args) if args.yes else netlify_plan(args)
    return github_push(args) if args.yes else github_plan(args)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("start", "share"):
        command = sub.add_parser(name)
        command.add_argument("--workspace", type=Path, default=Path.cwd(), help="business workspace (defaults to the current directory)")
        if name == "start":
            command.add_argument("--port", type=int, default=5173)
            command.add_argument("--wait", type=float, default=60, help="seconds to wait for the canvas to answer")
        if name == "share":
            command.add_argument("--to", choices=("netlify", "github"), required=True)
            command.add_argument("--repo", help="repository name in the person's account (defaults to the workspace folder's)")
            command.add_argument("--visibility", choices=("private", "public"), default="private")
            command.add_argument("--yes", action="store_true", help="the person said yes to the plan")
    args = parser.parse_args(argv)
    args.workspace = args.workspace.resolve()
    try:
        print(json.dumps((start if args.command == "start" else share)(args), indent=2))
    except Refused as refused:
        print(str(refused), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
