---
"uno-blueprint": minor
---

A signed-out visitor reads the board alone. Evidence and its counts, the edit history and its recovery list, audit findings and agent transcripts are now refused to the anon key; every signed-in reader keeps exactly the reads it had, and the board itself stays public. Apply migration `21000328000000` with this app: the Evidence tab asks a signed-out visitor to sign in, and the app no longer sends a read the database would refuse them.
