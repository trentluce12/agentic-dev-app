---
name: passthrough-note
description: An implementer carrying unknown frontmatter keys that must survive parse and serialize round-trips.
tools:
  - Read
x-tier: implementer
custom-note: hello
custom-array:
  - 1
  - 2
---

# passthrough-note

Regression fixture for passthrough-key preservation. The `custom-note` and `custom-array` keys are unknown to the Zod schema and must be emitted verbatim by the serializer.
