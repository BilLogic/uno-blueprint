# create-uno-blueprint

Start an [Uno Blueprint](https://github.com/BilLogic/uno-blueprint) workspace
with one command.

Uno Blueprint turns a service blueprint into structured, queryable data that
agents and people read from the same place. This package is its initialiser:
it writes the whole template into a folder, at the release that matches its
own version, and tells you what to type next.

## Use it

Every package manager maps `create uno-blueprint` to this package, so the
command has the same shape in each:

```bash
npm create uno-blueprint@latest my-blueprint
pnpm create uno-blueprint my-blueprint
yarn create uno-blueprint my-blueprint   # Yarn 1
bun create uno-blueprint my-blueprint
```

`my-blueprint` is the folder the workspace is written into. Leave it out and
the folder is `uno-blueprint`. Give `.` to write into the current folder. The
folder must be empty or not exist yet: one that already has files in it is
refused, and nothing of yours is overwritten.

With Yarn, that means Yarn 1. Yarn 2 and later cannot run the template. Under
them the workspace is still written and nothing is installed: asked to
install, the command exits with an error naming the package managers that can;
with `--no-install`, it says so in one line, prints the next steps for npm,
and succeeds.

The command asks no questions, so an agent can run it unattended. It ends by
printing the commands that start the canvas.

## Options

```text
create-uno-blueprint [directory] [options]
```

| Option | What it does |
| --- | --- |
| `--no-install` | Write the workspace and skip installing dependencies. |
| `--help` | Show the usage. |
| `--version` | Show the version. |

With npm, options go after a `--`:

```bash
npm create uno-blueprint@latest my-blueprint -- --no-install
```

The exit code is 0 only when the workspace is complete. Every refusal is one
line on stderr and exit code 1.

## What it writes

The template at the release tagged `v<version>`, where `<version>` is this
package's own. The initialiser and the template share one version number, so
`create-uno-blueprint --version` is the release you started from and that
release's upgrade recipe applies.

The workspace is a full copy: the app, the four `ub` skills, and the
references, agents and scripts they read. The one thing left out is this
initialiser's own folder.

It downloads the release tarball from GitHub and unpacks it itself. It needs
neither git nor a system `tar`, and it has no dependencies.

## Requirements

- **Node 22 or later.** An older Node is refused first, with a message naming
  the version needed.
- **Network access to `codeload.github.com`**, which serves the release. A
  download that fails says where it tried.

## More

- The template, its documentation and its issues:
  <https://github.com/BilLogic/uno-blueprint>
- Published from that repository's release tags. Every version after the
  first carries provenance, so you can see it was built there.

## Licence

MIT. See [LICENSE](./LICENSE).
