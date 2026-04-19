---
name: implementer-with-agent
description: An implementer-tier agent incorrectly granted the Agent tool, exercising the tier.implementer-has-agent-tool warning path.
tools:
  - Agent
  - Read
  - Write
x-tier: implementer
---

# implementer-with-agent

Regression fixture for the implementer-has-agent-tool warning. Granting the Agent tool to an implementer enables deep nesting that breaks the 3-tier contract.
