---
"uno-blueprint": patch
---

The agent account keeps what a signed-in reader reads. The generator asks the database as the anon key. Once that key was refused evidence, the edit history, audit findings and agent transcripts, their columns dropped out of the account, although a signed-in agent still reads them. A repository now names those relations and their columns in `repo-config.mjs` as `agentAccount.signedIn`, and the account renders each one in full, marked signed-in only, and counts it toward column-comment coverage. The field is required: set it to `null` to keep the account as it was, or to a function answering a Map of relation name to column names.
