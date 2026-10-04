---
summary: How a release is cut — changesets bump package.json, plugin.json and the CHANGELOG derive from it, and every release ends in an annotated v<version> tag on main, which is the only thing a consumer can pin and is what publishes the initialiser to npm.
---

# Releasing

**For** whoever cuts a release.
**Answers** what moves the version number, and what has to exist afterwards?

## 1. What a version means here

Semver is scoped to the **plugin contract** — the identifier layer in
[`identifiers.json`](../../identifiers.json). A rename there is a major,
because a consumer resolves those names at runtime with nothing to catch a
break. Refactoring the template app is not a release event, however much of it
moves. The reasoning is
[ADR 1](../adr/0001-two-contract-tiers-and-a-frozen-identifier-layer.md).

## 2. During the work

Add a changeset in the same pull request as the change:

```bash
npx changeset
```

The note says what changed and how big it was. Nothing else in the release
depends on remembering to write it later.

## 3. Cutting the release

```bash
npm run version        # changeset version, then propagate from package.json
```

That bumps `package.json`, writes the CHANGELOG entry from the pending
changesets, and copies the new number into `.claude-plugin/plugin.json` — the
version a consumer's plugin install actually reads — and into the lockfile and
the initialiser's manifest, the `package.json` under
`packages/create-uno-blueprint/`. Edit the CHANGELOG entry
into prose a human would want to read, and flag identifier-layer changes under
a `### Plugin contract` heading.

Then check every statement agrees, and merge:

```bash
npm run check:version
```

## 4. Tag it. Every release gets a tag.

The tag is not bookkeeping — it is the release. A consumer pins
`github:BilLogic/uno-blueprint#v<version>`, which resolves a tag
and nothing else; the lockfile integrity hash exists because a tag names one
immutable tree. A released version with no tag is a number nothing downstream
can ask for.

On `main`, at the release commit:

```bash
git tag -a v0.4.0 -m "v0.4.0"
git push origin v0.4.0
npm run check:release-tag -- --require
```

`--require` fails until the tag exists. Without it — the mode CI runs on every
pull request — the check still holds the tags that do exist honest: a tag whose
name is not a released version, a `v<version>` tag pointing at a tree that
states a different version, and, once tagging has started, any release from the
oldest tag forward that skipped one.

Releases 0.1.0 through 0.4.0 shipped before this procedure existed. They are
not retro-tagged; tagging begins at the first tag and may not be interrupted
after it.

## 5. Verifying what a consumer gets

```bash
npm pack github:BilLogic/uno-blueprint#v0.4.0
```

That is the resolution path a downstream lockfile takes. It prints the file
list, the shasum and the integrity hash. `package.json` is `private: true`,
which blocks `npm publish` and does not block this — see ADR 1 §5.

## 6. The tag publishes the initialiser

Pushing the tag in § 4 starts
[`publish-initialiser.yml`](../../.github/workflows/publish-initialiser.yml),
which publishes `create-uno-blueprint` to npm at that version, with
provenance. There is nothing to run by hand after the first time.

**The tag comes first, always.** The published initialiser downloads the
release tagged `v<its own version>`, so a version on the registry with no tag
behind it is a command that ends in a 404. The workflow holds that order by
construction, because the tag is what starts it. A publish by hand has to hold
it too.

**Only a tag on `main` publishes.** A tag can be pushed on any commit, and a
version on the registry is permanent, so the workflow refuses a tag whose
commit `main` does not contain.

It uses npm's trusted publishing: the registry trusts this repository and that
workflow file by name, the job proves which run it is with a short-lived
token, and no npm token is stored in the repository. There is no secret to
add and none to rotate.

### What a run does

Before it publishes, the workflow runs
`scripts/decide-initialiser-publish.mjs`. Every run ends one of these ways,
and the run's log says which in one line.

| The run | Why | What to do |
| --- | --- | --- |
| Green, published | The tag, the initialiser's manifest and every other statement of the version agree, the tagged commit is on `main`, and the registry does not have the version. | Nothing. |
| Green, nothing published | The registry already has this version. This is what re-running a tag's run does. | Nothing. |
| Green, nothing published | The repository is not the one the initialiser's manifest names: a fork, a repository made from the template, or any other copy. It carries the manifest and is not where the package comes from. The line names both repositories. | Nothing in a copy. In the template's own repository after a rename or a transfer, this row is a release that published nothing while the run reads green: update the manifest's `repository` and the trusted publisher, as the next paragraph says. |
| Green, nothing published | The tree has no initialiser. A workspace carries the workflow and has no package. | Nothing. |
| Red | The tag is not the version the initialiser's manifest states, or the places `npm run check:version` holds together disagree. | Fix the release. A tag that points at the wrong tree is replaced by the next version, not moved. |
| Red | The tagged commit is not on `main`. | Tag the release commit on `main`, as § 4 says. |
| Red | The npm the job has is older than 11.5.1, the first that can publish without a token, or could not be asked its version. | Raise `node-version` in the workflow. Nothing is installed over the npm that Node carries. |
| Red | The registry could not be asked whether the version exists. | Re-run the run. Nothing is wrong with the release, and changing a version would not help. |

**Renaming or moving this repository without updating the manifest gives a
green run that publishes nothing.** Every release lands in the "not the
repository its manifest names" row above, and nothing goes red to say so. So
the rename and the manifest change are one change: update the `repository`
url in the initialiser's manifest in the same pull request as the rename, and
the trusted publisher on npmjs.com the same day. Then the next tag publishes
again.

### Once, by the owner

Trust is set per package, on a package that already exists, so the first
version is published by hand from the owner's own npm account. These steps
happen once and are never repeated.

1. **Log in to npm.**

   ```bash
   npm login
   ```

2. **Publish the first version by hand, from the initialiser's folder, at the
   tag.** Cut the release through § 4 first, so the tag is on GitHub, then
   publish the tree the tag names:

   ```bash
   git checkout v<version>
   cd packages/create-uno-blueprint
   npm publish --access public
   ```

   This one version carries no provenance: an attestation is made by a CI run,
   and a laptop is not one. Every version after it does.

3. **Add this repository and the workflow file as the package's trusted
   publisher.** On npmjs.com, open `create-uno-blueprint`, then *Settings*,
   then *Trusted Publisher*, choose *GitHub Actions*, and enter:

   | Field | Value |
   | --- | --- |
   | Organization or user | `BilLogic` |
   | Repository | `uno-blueprint` |
   | Workflow filename | `publish-initialiser.yml` |
   | Environment name | leave empty |

   Every field is case-sensitive, and the filename is the file's name alone,
   with its extension and without its folder. Once that is saved, the same
   page can disallow token publishing for the package, which leaves the
   workflow as the only way a version gets out.

4. **Protect the tags, as a second lock.** The workflow's own check that a tag
   is on `main` is the first. On GitHub, under the repository's *Settings*,
   then *Rules*, then *Rulesets*, add a tag ruleset that targets `v*` and
   restricts creating, updating and deleting those tags to the people who cut
   releases. Then a tag that could start a publish cannot be pushed by anybody
   else in the first place, and a release tag cannot be moved after the fact.

The first tag pushed after this workflow lands starts a run before any of that
exists, and its publish step fails: the registry has no reason to trust it
yet. That one red run is expected. When the steps above are done, re-run it.
It finds the version on the registry and goes green.

**That re-run proves less than it looks like.** It stops at "already
published", before the job asks for a token, so it shows that the decision
reads the registry and nothing about trusted publishing. The first time the
registry is asked to trust this workflow is the second release. Watch that
run.

Renaming the workflow file breaks the trust, because the registry holds the
name. Change it on npmjs.com in the same breath.
