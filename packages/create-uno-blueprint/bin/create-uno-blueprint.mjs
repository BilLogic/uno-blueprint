#!/usr/bin/env node
/**
 * The command. Everything it does is `run`, handed the real process by
 * `runInProcess` beside it, so a test can hand it a throwaway one.
 *
 * WRITTEN IN THE SYNTAX AN OLD NODE PARSES, and that is the whole reason it
 * looks the way it does. `run` checks the Node floor first — but a Node old
 * enough fails to PARSE the module `run` lives in, and says `SyntaxError`
 * about an operator instead of which Node is needed. So the floor is checked
 * here as well, in nothing newer than `var`, function expressions, a static
 * `import` of the floor and a dynamic `import()` of the entry — the last only
 * once the check has passed. That is the module syntax any Node that can load
 * this file at all already parses. The floor is `src/node-floor.mjs`, which
 * `run` reads too; both manifests state it in `engines`.
 */
import { NODE_FLOOR } from '../src/node-floor.mjs'

function lastResort(error) {
  // Nothing should arrive here: `run` reports its own failures in one line.
  // What does is still owed one line and a failing exit, not a stack trace.
  var why = error && error.message ? error.message : String(error)
  process.stderr.write('create-uno-blueprint: ' + why.replace(/\s+/g, ' ') + '\n')
  process.exitCode = 1
}

// "Not at least", so a version that cannot be read is refused too.
if (!(parseInt(process.versions.node, 10) >= NODE_FLOOR)) {
  process.stderr.write(
    'create-uno-blueprint: Node ' + NODE_FLOOR + ' or later is needed; this is Node ' + process.versions.node + '.\n'
  )
  process.exitCode = 1
} else {
  import('../src/run.mjs')
    .then(function (entry) {
      return entry.runInProcess()
    })
    .then(function (code) {
      process.exitCode = code
    })
    .catch(lastResort)
}
