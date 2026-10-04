# Changesets

A changeset is a note saying what changed and how big it was. Add one in the
same pull request as the change:

```bash
npx changeset
```

`npx changeset version` then consumes every pending note, bumps
`package.json`, and writes the CHANGELOG entry. Run `npm run version` instead
of calling it directly — that also copies the new number into
`.claude-plugin/plugin.json`, which is the version a consumer's plugin install
actually reads, into both statements in `package-lock.json`, and into the
initialiser's manifest under `packages/create-uno-blueprint/`, which downloads
the release whose tag is its own version.

**Semver here is scoped to the plugin contract**, the identifier lane in
`identifiers.json`: skill names, reference filenames, schema filenames, agent
names, hook events, agent tool names. A rename there is a major. Refactoring
the template app is not, however much of it moves — a consumer forks that
surface and takes our changes as a visible merge conflict.

The full procedure — including the annotated `v<version>` tag every release
gets, which is the only thing a consumer can pin — is in
[`docs/engineering/releasing.md`](../docs/engineering/releasing.md); the
decision behind it is
[ADR 1](../docs/adr/0001-two-contract-tiers-and-a-frozen-identifier-layer.md).
