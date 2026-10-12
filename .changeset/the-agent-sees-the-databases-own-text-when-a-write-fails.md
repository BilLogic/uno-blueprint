---
'uno-blueprint': patch
---

The agent sees the database's own text when a write fails. A refused write still shows a person the friendly sentence, but the tool result the model reads now carries the database's text beside it, as `Error: <sentence> (database: <raw>)`. Before, an untranslatable failure reached the model only as "The details are in the console", which it cannot open, so it re-read and retried blind. The transcript row keeps the sentence as its summary, and its expandable detail shows the same answer the model got. Failures that are not authoring errors are unchanged.

Upgrading a deployment: nothing to do.
