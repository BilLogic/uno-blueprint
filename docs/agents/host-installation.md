---
summary: Install and update the same Uno skills in Codex, Claude Code, Cursor or Antigravity, connect a person's remote account, and configure the canvas OAuth consent route.
---

# Run Uno in an agent host

The source is `skills/`; Claude Code and Cursor use their manifests beside
that directory. `.agents/skills/` is the generated discovery mirror. There
is no host-specific copy to edit. A signed-in account selects its own profile
through `get_profile`; `list_blueprint` selects onboarding or daily work.
The server must include these read tools before remote init can start.

## One remote connection

An operator supplies the test project's public tool endpoint:
`https://<project-ref>.supabase.co/functions/v1/uno-tools`. Call the connection
`uno` in every host. Use Streamable HTTP and the host's OAuth sign-in flow;
the protected-resource metadata points at Supabase Auth. Tokens belong to
the person signing in, and RLS still applies. Never configure a service role
key. Do not put a token in a checked-in manifest or a command argument.

While interactive sign-in is unavailable, a short-lived person JWT can be
supplied to the native host through the `UNO_ACCESS_TOKEN` environment
variable, populated by an operator from a gitignored `.env` or a password
login held in memory. This is a separate JWT proof, not proof of OAuth.
Do not share the terminal environment or retain its transcripts. Renew the
person's token when it expires; this fallback does not refresh it for you.

## Codex

Clone the repository, open that directory, then connect `uno` using the
endpoint above (`codex mcp add uno --url <endpoint>`). Run
`codex mcp login uno` for OAuth once the server is enabled. For the temporary
JWT fallback, set `bearer_token_env_var = "UNO_ACCESS_TOKEN"` under
`[mcp_servers.uno]` in your private Codex configuration, then start Codex from
that environment. `codex mcp list` checks configuration; an actual
`get_profile` call checks the account connection.

Invoke `$ub:init` and name `.agents/skills/init/SKILL.md` if the host lists
the bare discovery name `init`. The source frontmatter remains `init` for
Claude's plugin namespace; Codex's built-in `/init` is a different command.
Update with `git pull --ff-only` on the selected release branch and start a
fresh session. Contributors changing canonical skills run
`npm run sync:skills`; operators consuming a release do not edit the mirror.

## Claude Code

From a clone, run `claude --plugin-dir /absolute/path/to/uno-blueprint`.
The existing `.claude-plugin/plugin.json` exposes `/ub:init`. Add the remote
connection with `claude mcp add --transport http uno <endpoint>` and use
`/mcp` to sign in. For a private JWT fallback config, use:

```json
{
  "mcpServers": {
    "uno": {
      "type": "http",
      "url": "https://<project-ref>.supabase.co/functions/v1/uno-tools",
      "headers": { "Authorization": "Bearer ${UNO_ACCESS_TOKEN}" }
    }
  }
}
```

Pass that private file with `--mcp-config /path/to/config.json`; its token is
expanded from the environment. Pull the repository and restart Claude Code
with the same plugin directory to pick up updates. Use `/ub:init`, never
the built-in `/init`.

## Cursor — unverified

Open the clone as the workspace so Cursor can discover `.agents/skills/`.
The Cursor manifest is `.cursor-plugin/plugin.json` and points to the same
`skills/` source. For an existing business workspace, add this clone's skill
mirror to the host's supported skills directory and keep its referenced
files available from the repository root. Connect `uno` in Cursor's MCP
settings using the endpoint in “One remote connection”, then sign in.
Confirm the skill and tool lists before running init. Pull and reload the
workspace for updates. Repository marketplace installation is not claimed:
this repository has no Cursor marketplace catalog.

Whether Cursor reads `.claude-plugin/plugin.json` is **unverified**; do not
assume that compatibility. The explicit Cursor manifest avoids depending on
it. Clean installation, command spelling, OAuth and update pickup still
need a Cursor operator's check.

## Antigravity — unverified

Open the clone and point the host's documented skill discovery at
`.agents/skills/`, retaining the repository root for referenced files. Add
the same HTTP endpoint as `uno` through its MCP settings and sign in. Check
that init and the remote tools are listed, then invoke the discovered init
skill. Pull and restart to update. Exact settings, invocation and OAuth
support have not been exercised in this host; do not copy another host's
configuration schema and assume it works.

## Local canvas consent and test-project setup

The app serves `/oauth/consent` before loading the board. Supabase Auth
supplies `authorization_id`; the page signs in if needed, fetches the
verified client, account, scopes and callback, and sends Allow or Decline
only on a click. Only Auth's returned `redirect_url` controls navigation.
Previously granted consent may return a redirect immediately, as specified
by the Auth SDK. There is no admin key, automatic first-time approval, or
blueprint mutation in this route.

The installed CLI's `config push` applies the whole local Auth configuration;
it has no field-level OAuth update flag. Do not push unrelated settings to
the shared test project. An operator can perform these exact dashboard steps:

1. Open the existing test project, **Authentication → URL Configuration**.
   Set **Site URL** to `http://localhost:5173`. Preserve existing redirect
   entries and add `http://localhost:5173/oauth/consent` if absent. Save.
2. Open **Authentication → OAuth Server**. Enable the OAuth server, set
   **Authorization Path** to `/oauth/consent`, enable **Dynamic Client
   Registration** for native host registration, and save.
3. Start this canvas against that test project's public URL and anon key at
   `http://localhost:5173` (keep credentials in ignored `.env`). If a pilot
   already owns that port, coordinate its update instead of stopping it.
4. Check discovery at the Supabase project's
   `/.well-known/oauth-authorization-server/auth/v1`, then start host OAuth
   sign-in. Verify the browser reaches the local consent route, shows the
   correct app/account/scopes, and both Allow and Decline return to the host.
   Verify a remote tool call uses the signed-in person's profile and RLS.
5. When a hosted canvas address exists, add its exact consent URL to
   **URL Configuration → Redirect URLs**, retaining the local URL. Configure
   that deployment to serve this route. Adding an allowed URL alone does
   not change the active consent origin: Site URL plus Authorization Path
   still selects it. Switch Site URL to the hosted origin only when the
   operator is ready to move consent there. No hosting is created here.

Interactive sign-in remains unverified until these steps and the browser
round trip complete. Local config defaults enable this same localhost flow;
they do not imply the remote project has been changed.

## Reproduce the native host proof

`npm run test:agent-hosts:project` requires the installed, already signed-in
Codex and Claude Code CLIs plus the existing synthetic test login variables
listed in `.env.example`. It uses temporary skill copies, a person JWT in
memory, and only `get_profile` / `list_blueprint`. Each host runs once after
install and once after changing its temporary canonical skill and mirror.
A marker read from the changed skill proves update pickup. The script
withholds host transcripts, deletes its fixtures and signs out only its own
temporary login. It does not stamp `last_run_at` or write blueprint rows.
This proves startup and entry reads, not every host capability or OAuth.

Primary references: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp),
[Claude Code MCP](https://code.claude.com/docs/en/mcp),
[Cursor plugin specification](https://github.com/cursor/plugins),
[Supabase OAuth setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started).
