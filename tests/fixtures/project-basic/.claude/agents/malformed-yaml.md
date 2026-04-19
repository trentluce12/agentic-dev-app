---
name: malformed-yaml
description: Broken fixture used to exercise the YAML parse-error recovery path.
tools: [Read, Grep
 : stray-unquoted-colon
  another: value
---

# malformed-yaml

Regression fixture for the malformed-YAML path. `parseFrontmatter` must throw `FrontmatterParseError`; `agents:list` must recover with `hasIssues: true` and `description: '(parse error)'` rather than crashing the handler.
